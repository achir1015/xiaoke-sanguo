# -*- coding: utf-8 -*-
"""遊戲狀態與規則。

整局遊戲就是一個可以轉成 JSON 的 dict（self.s），存檔、網路同步、重播都直接用它。
每一回合＝一個月：各勢力依序下達指令（每位武將每月一個指令），全部結束後進行月底結算。
"""
import copy
import math

from . import battle as B
from . import data as D
from .rng import Rng

SAVE_VERSION = 1

ACTION_NAMES = {
    'farm': '開墾', 'trade': '商業', 'defense': '修城', 'order': '撫民',
    'recruit': '徵兵', 'train': '訓練', 'search': '搜索', 'hire': '登用', 'reward': '褒賞',
    'move': '移動', 'transport': '運輸', 'attack': '出征', 'release': '釋放', 'end': '結束回合',
}
DEVELOP_COST = 100

ADJ = {}
ROAD_KIND = {}
for _a, _b, _k in D.ROADS:
    ADJ.setdefault(_a, []).append(_b)
    ADJ.setdefault(_b, []).append(_a)
    ROAD_KIND[(_a, _b)] = ROAD_KIND[(_b, _a)] = _k


class GameError(Exception):
    pass


def static_data():
    """不會改變的資料（地圖、道路、劇本、軍師），前端只要拿一次。"""
    return {
        'cities': {k: {'id': k, 'name': v[0], 'x': v[1], 'y': v[2], 'terrain': v[3], 'max_farm': v[4],
                       'max_trade': v[5], 'max_def': v[6], 'base_pop': v[7]} for k, v in D.CITIES.items()},
        'roads': [list(r) for r in D.ROADS],
        'adj': ADJ,
        'scenarios': {k: {'id': k, 'name': v['name'], 'year': v['year'], 'desc': v['desc'],
                          'factions': [{'key': f['key'], 'name': f['name'], 'ruler': f['ruler'], 'color': D.COLORS[f['color']],
                                        'cities': list(f['cities'].keys())} for f in v['factions']]}
                      for k, v in D.SCENARIOS.items()},
        'advisors': [{'id': a[0], 'name': a[1], 'gender': a[2], 'style': a[3], 'style_name': D.STYLE_NAMES[a[3]],
                      'epithet': a[4], 'say': a[5]} for a in D.ADVISORS],
        'players': [{'id': p[0], 'title': p[1], 'gender': p[2]} for p in D.PLAYER_PORTRAITS],
        'tactics': B.TACTICS, 'tactic_tips': B.TACTIC_TIPS, 'action_names': ACTION_NAMES,
        'rulerIds': {o['name']: o['id'] for o in D.OFFICERS},
    }


class Game:
    def __init__(self, state=None):
        self.s = state
        self.rng = Rng(state) if state else None
        self.events = []

    # ---------------- 建立新局 ----------------
    @classmethod
    def new(cls, scenario='s194', players=None, seed=1, limit_months=0, victory='unify'):
        """players：{勢力key: {'kind': 'human'|'ai'|'remote', 'level': 'easy'|'normal'|'hard', 'name', 'portrait', 'advisor'}}
        沒有列出的勢力都由電腦控制。"""
        sc = D.SCENARIOS[scenario]
        s = {
            'version': SAVE_VERSION, 'scenario': scenario, 'year': sc['year'], 'month': sc['month'],
            'start_year': sc['year'], 'start_month': sc['month'], 'turn': 1,
            'rng': (int(seed) * 2654435761 + 12345) & ((1 << 48) - 1),
            'factions': {}, 'order': [], 'cur': 0, 'phase': 'command',
            'cities': {}, 'officers': {}, 'battle': None, 'log': [], 'winner': None,
            'limit_months': int(limit_months or 0), 'victory': victory, 'players': {}, 'seq': 0,
        }
        g = cls(s)
        year = sc['year']
        for cid, c in D.CITIES.items():
            s['cities'][cid] = {
                'id': cid, 'owner': None, 'gold': 300, 'food': 2000, 'pop': int(c[7] * 0.6),
                'farm': int(c[4] * 0.3), 'trade': int(c[5] * 0.3), 'defense': int(c[6] * 0.4),
                'order': 50, 'soldiers': 1500, 'training': 40, 'morale': 60,
            }
        for o in D.OFFICERS:
            st = 'unborn' if o['from'] > year else ('dead' if o['to'] < year else 'free')
            s['officers'][o['id']] = {
                'id': o['id'], 'name': o['name'], 'female': o['female'],
                'lead': o['lead'], 'war': o['war'], 'int': o['int'], 'pol': o['pol'], 'cha': o['cha'],
                'faction': None, 'city': o['home'], 'status': st, 'found': False, 'loyalty': 70,
                'acted': False, 'rewarded': False, 'from': o['from'], 'to': o['to'],
            }
        players = players or {}
        for f in sc['factions']:
            fid = f['key']
            ruler = D.OFFICER_BY_NAME[f['ruler']]['id']
            caps = list(f['cities'].keys())
            p = players.get(fid) or {}
            s['factions'][fid] = {
                'id': fid, 'name': f['name'], 'color': D.COLORS[f['color']], 'ruler': ruler,
                'capital': caps[0], 'alive': True, 'named_by_ruler': f['name'] == f['ruler'],
            }
            s['players'][fid] = {
                'kind': p.get('kind', 'ai'), 'level': p.get('level', 'normal'), 'name': p.get('name', ''),
                'portrait': p.get('portrait', ''), 'advisor': p.get('advisor', ''), 'proxy': False,
                'peer': p.get('peer', ''),
            }
            s['order'].append(fid)
            big = len(caps)
            for i, cid in enumerate(caps):
                c = s['cities'][cid]
                base = D.CITIES[cid]
                c['owner'] = fid
                c['gold'] = 1200 if i == 0 else 600
                c['food'] = 9000 if i == 0 else 5000
                c['pop'] = base[7]
                c['farm'] = int(base[4] * 0.55)
                c['trade'] = int(base[5] * 0.55)
                c['defense'] = int(base[6] * 0.6)
                c['order'] = 65
                c['soldiers'] = (9000 if i == 0 else 5000) + (2000 if big <= 2 else 0)
                c['training'] = 55
                c['morale'] = 70
                for name in f['cities'][cid]:
                    o = s['officers'][D.OFFICER_BY_NAME[name]['id']]
                    o.update(faction=fid, city=cid, status='serve', loyalty=100 if name == f['ruler'] else 85)
        # 空城（無主）守軍
        for cid, c in s['cities'].items():
            if c['owner'] is None:
                c['soldiers'] = 3000
                c['training'] = 45
        # 人類玩家先下，其次依劇本順序
        s['order'].sort(key=lambda fid: 0 if s['players'][fid]['kind'] != 'ai' else 1)
        g.log(f"{sc['year']} 年 {sc['month']} 月，《{sc['name']}》開始！")
        g.start_faction_turn()
        return g

    # ---------------- 工具 ----------------
    def officer(self, oid):
        return self.s['officers'][oid]

    def city(self, cid):
        return self.s['cities'][cid]

    def faction(self, fid):
        return self.s['factions'][fid]

    def city_name(self, cid):
        return D.CITIES[cid][0]

    def fname(self, fid):
        return self.s['factions'][fid]['name'] if fid else '無主'

    def is_ruler(self, oid):
        o = self.officer(oid)
        return o['faction'] and self.s['factions'][o['faction']]['ruler'] == oid

    def current(self):
        if self.s['phase'] == 'over':
            return None
        return self.s['order'][self.s['cur']]

    def officers_in(self, cid, status='serve', fid=None):
        return [o for o in self.s['officers'].values()
                if o['city'] == cid and o['status'] == status and (fid is None or o['faction'] == fid)]

    def cities_of(self, fid):
        return [c for c in self.s['cities'].values() if c['owner'] == fid]

    def log(self, text, **kw):
        self.s['seq'] += 1
        entry = {'seq': self.s['seq'], 'y': self.s['year'], 'm': self.s['month'], 'text': text}
        entry.update(kw)
        self.s['log'].append(entry)
        if len(self.s['log']) > 300:
            del self.s['log'][:-300]

    def emit(self, ev):
        if 'text' in ev and not ev.get('nolog'):
            self.log(ev['text'], kind=ev['type'], fid=ev.get('fid'))
        self.events.append(ev)

    def kill_officer(self, oid, in_battle=None):
        o = self.officer(oid)
        fid = o['faction']
        o['status'] = 'dead'
        o['faction'] = None
        if in_battle:
            for side in ('att', 'def'):
                in_battle[side]['officers'] = [x for x in in_battle[side]['officers'] if x != oid]
        if fid and self.s['factions'][fid]['ruler'] == oid:
            self.succession(fid)

    def succession(self, fid):
        f = self.s['factions'][fid]
        cands = [o for o in self.s['officers'].values() if o['faction'] == fid and o['status'] == 'serve']
        if not cands:
            self.eliminate(fid, '君主身亡且無人繼承')
            return
        old = self.officer(f['ruler'])['name']
        heir = max(cands, key=lambda o: o['cha'] * 2 + o['lead'] + o['pol'])
        f['ruler'] = heir['id']
        heir['loyalty'] = 100
        if f.get('named_by_ruler'):
            f['name'] = heir['name']
        self.emit({'type': 'succession', 'fid': fid, 'officer': heir['id'], 'text': f"{old} 之後，由 {heir['name']} 繼承大業。"})

    def eliminate(self, fid, why=''):
        f = self.s['factions'][fid]
        if not f['alive']:
            return
        f['alive'] = False
        for o in self.s['officers'].values():
            if o['faction'] == fid and o['status'] == 'serve':
                o['faction'] = None
                o['status'] = 'free'
                o['found'] = True
        for c in self.s['cities'].values():
            if c['owner'] == fid:
                c['owner'] = None
        self.emit({'type': 'eliminated', 'fid': fid, 'text': f"{f['name']} 勢力滅亡了。{why}"})

    # ---------------- 回合流程 ----------------
    def start_faction_turn(self):
        fid = self.current()
        if not fid:
            return
        for o in self.s['officers'].values():
            if o['faction'] == fid:
                o['acted'] = False
                o['rewarded'] = False
        self.emit({'type': 'turn', 'fid': fid, 'nolog': True,
                   'text': f"{self.s['year']} 年 {self.s['month']} 月　{self.fname(fid)} 的回合"})

    def end_turn(self):
        if self.s['phase'] != 'command':
            raise GameError('戰鬥還沒結束')
        order = self.s['order']
        nxt = self.s['cur'] + 1
        while nxt < len(order) and not self.s['factions'][order[nxt]]['alive']:
            nxt += 1
        if nxt >= len(order):
            self.month_end()
            if self.s['phase'] == 'over':
                return
            nxt = 0
            while not self.s['factions'][order[nxt]]['alive']:
                nxt += 1
        self.s['cur'] = nxt
        self.start_faction_turn()

    def month_end(self):
        s = self.s
        harvest = s['month'] == 7
        for c in s['cities'].values():
            if c['owner'] is None:
                c['soldiers'] = min(4000, c['soldiers'] + 50)
                continue
            p = s['players'].get(c['owner'], {})
            bonus = {'easy': 0.85, 'normal': 1.0, 'hard': 1.2}.get(p.get('level'), 1.0) if p.get('kind') == 'ai' else 1.0
            of = 0.6 + c['order'] / 250.0
            c['gold'] += int(c['trade'] * 0.35 * of * bonus)
            c['food'] += int(c['farm'] * 0.3 * of * bonus)
            if harvest:
                c['food'] += int(c['farm'] * 5 * of * bonus)
            c['food'] -= int(c['soldiers'] * 0.025)
            if c['food'] < 0:
                c['food'] = 0
                lost = c['soldiers'] // 10
                c['soldiers'] -= lost
                c['morale'] = max(0, c['morale'] - 10)
                c['order'] = max(0, c['order'] - 5)
                self.emit({'type': 'famine', 'city': c['id'], 'fid': c['owner'], 'text': f"{self.city_name(c['id'])} 糧食不足，{lost} 名士兵逃亡！"})
            maxpop = D.CITIES[c['id']][7] * 1.6
            c['pop'] = int(min(maxpop, c['pop'] * (1 + 0.003 * (c['order'] - 40) / 30.0)))
            if c['soldiers'] > c['pop'] * 0.35:
                c['order'] = max(0, c['order'] - 1)
            c['morale'] += (1 if c['morale'] < 70 else (-1 if c['morale'] > 85 else 0))
        if harvest:
            self.emit({'type': 'harvest', 'text': '七月秋收，各城糧食大豐收。'})
        # 俘虜逃脫、低忠誠離開
        for o in s['officers'].values():
            if o['status'] == 'prisoner' and self.rng.chance(0.08):
                self.prisoner_escape(o)
            elif o['status'] == 'serve' and not self.is_ruler(o['id']) and o['loyalty'] < 35 and self.rng.chance(0.08):
                fid = o['faction']
                o.update(status='free', faction=None, found=True)
                self.emit({'type': 'leave', 'fid': fid, 'officer': o['id'], 'text': f"{o['name']} 對主公不滿，離開了 {self.fname(fid)}。"})
        # 下個月
        s['month'] += 1
        s['turn'] += 1
        if s['month'] > 12:
            s['month'] = 1
            s['year'] += 1
            self.new_year()
        self.emit({'type': 'month', 'text': f"── {s['year']} 年 {s['month']} 月 ──"})
        self.check_victory(month_end=True)

    def new_year(self):
        y = self.s['year']
        for o in self.s['officers'].values():
            if o['status'] == 'unborn' and o['from'] <= y:
                o['status'] = 'free'
                o['found'] = False
            elif o['status'] in ('serve', 'free', 'prisoner') and o['to'] < y and self.rng.chance(0.5):
                fid = o['faction'] if o['status'] == 'serve' else None
                was_ruler = fid and self.is_ruler(o['id'])
                o['status'] = 'dead'
                if fid:
                    self.emit({'type': 'death', 'fid': fid, 'officer': o['id'], 'text': f"{o['name']} 病逝了。"})
                    o['faction'] = None
                    if was_ruler:
                        o['faction'] = fid
                        self.s['factions'][fid]['ruler'] = o['id']
                        o['faction'] = None
                        self.succession(fid)
                else:
                    o['faction'] = None

    def prisoner_escape(self, o):
        home = o.get('prev_faction')
        o['status'] = 'free'
        o['found'] = True
        o['faction'] = None
        if home and self.s['factions'].get(home, {}).get('alive'):
            cities = self.cities_of(home)
            if cities:
                o.update(status='serve', faction=home, city=cities[0]['id'])
                self.emit({'type': 'escape', 'fid': home, 'officer': o['id'], 'text': f"{o['name']} 逃出牢籠，回到 {self.fname(home)}。"})
                return
        self.emit({'type': 'escape', 'officer': o['id'], 'text': f"{o['name']} 逃出牢籠，成為在野武將。"})

    def score(self, fid):
        sc = 0
        for c in self.cities_of(fid):
            sc += 100 + c['pop'] // 2000 + c['soldiers'] // 300 + c['farm'] // 50 + c['trade'] // 50
        sc += 5 * sum(1 for o in self.s['officers'].values() if o['faction'] == fid and o['status'] == 'serve')
        return sc

    def check_victory(self, month_end=False):
        s = self.s
        for fid, f in s['factions'].items():
            if f['alive'] and not self.cities_of(fid):
                self.eliminate(fid, '已經沒有任何城池')
        alive = [fid for fid, f in s['factions'].items() if f['alive']]
        winner = None
        reason = ''
        if len(alive) == 1:
            winner, reason = alive[0], '一統天下'
        elif not alive:
            s['phase'] = 'over'
            s['winner'] = None
            self.emit({'type': 'gameover', 'winner': None, 'text': '天下大亂，無人勝出。'})
            return True
        elif month_end and s['limit_months'] and s['turn'] > s['limit_months']:
            winner = max(alive, key=self.score)
            reason = f"期限到，國力第一（{self.score(winner)} 分）"
        else:
            humans = [fid for fid in alive if s['players'][fid]['kind'] != 'ai']
            had_humans = any(p['kind'] != 'ai' for p in s['players'].values())
            if had_humans and not humans and not s.get('spectate'):
                winner = max(alive, key=self.score)
                reason = '所有玩家都已滅亡'
        if winner:
            s['phase'] = 'over'
            s['winner'] = winner
            s['battle'] = None
            self.emit({'type': 'gameover', 'winner': winner, 'text': f"{self.fname(winner)} 獲勝！（{reason}）"})
            return True
        return False

    # ---------------- 指令 ----------------
    def act(self, fid, a):
        """執行一個指令，回傳這次產生的事件。"""
        self.events = []
        s = self.s
        if s['phase'] == 'over':
            raise GameError('遊戲已經結束')
        t = a.get('type')
        if t == 'tactic':
            self.battle_choose(fid, a.get('tactic'))
            return self.events
        if s['phase'] == 'battle':
            raise GameError('正在戰鬥中')
        if fid != self.current():
            raise GameError('還沒輪到這個勢力')
        if t == 'end':
            self.end_turn()
            return self.events
        if t == 'reward':
            self.do_reward(fid, a)
            return self.events
        if t == 'release':
            self.do_release(fid, a)
            return self.events
        cid = a.get('city')
        c = s['cities'].get(cid)
        if not c or c['owner'] != fid:
            raise GameError('這不是我方的城池')
        if t in ('move', 'attack'):
            ids = a.get('officers') or []
            if not ids:
                raise GameError('請選擇武將')
            offs = [self.ready_officer(fid, cid, oid) for oid in ids]
            return getattr(self, 'do_' + t)(fid, c, offs, a) or self.events
        off = self.ready_officer(fid, cid, a.get('officer'))
        fn = getattr(self, 'do_' + t, None)
        if fn is None or t in ('end', 'tactic'):
            raise GameError('未知的指令')
        fn(fid, c, off, a)
        return self.events

    def ready_officer(self, fid, cid, oid):
        o = s_o = self.s['officers'].get(oid)
        if not o or o['faction'] != fid or o['status'] != 'serve' or o['city'] != cid:
            raise GameError('這位武將不在這座城')
        if s_o['acted']:
            raise GameError(f"{o['name']} 這個月已經行動過了")
        return o

    def pay(self, c, gold=0, food=0):
        if c['gold'] < gold:
            raise GameError(f'金錢不足（需要 {gold}）')
        if c['food'] < food:
            raise GameError(f'糧食不足（需要 {food}）')
        c['gold'] -= gold
        c['food'] -= food

    def _develop(self, fid, c, o, key, maxv, gain, label):
        if c[key] >= maxv:
            raise GameError(f'{label}已經到達上限')
        self.pay(c, DEVELOP_COST)
        before = c[key]
        c[key] = min(maxv, c[key] + gain)
        o['acted'] = True
        self.emit({'type': 'develop', 'fid': fid, 'city': c['id'], 'officer': o['id'], 'kind': key,
                   'delta': c[key] - before, 'text': f"{o['name']} 在 {self.city_name(c['id'])} {label}，{label}+{c[key] - before}"})

    def do_farm(self, fid, c, o, a):
        self._develop(fid, c, o, 'farm', D.CITIES[c['id']][4], 10 + o['pol'] // 4, '開墾')

    def do_trade(self, fid, c, o, a):
        self._develop(fid, c, o, 'trade', D.CITIES[c['id']][5], 10 + o['pol'] // 4, '商業')

    def do_defense(self, fid, c, o, a):
        self._develop(fid, c, o, 'defense', D.CITIES[c['id']][6], 15 + o['lead'] // 4, '城防')

    def do_order(self, fid, c, o, a):
        if c['order'] >= 100:
            raise GameError('民心已經滿了')
        self.pay(c, 0, 100)
        before = c['order']
        c['order'] = min(100, c['order'] + 4 + o['cha'] // 12)
        o['acted'] = True
        self.emit({'type': 'develop', 'fid': fid, 'city': c['id'], 'officer': o['id'], 'kind': 'order', 'delta': c['order'] - before,
                   'text': f"{o['name']} 在 {self.city_name(c['id'])} 撫恤百姓，民心+{c['order'] - before}"})

    def do_recruit(self, fid, c, o, a):
        amt = int(a.get('amount') or 1000)
        amt = max(500, min(5000, amt // 500 * 500))
        if c['pop'] < amt * 4:
            raise GameError('人口不足，無法徵兵')
        cost = amt * 3 // 20
        self.pay(c, cost)
        bonus = 1.0 + max(0, o['cha'] - 50) / 200.0
        got = int(amt * bonus)
        total = c['soldiers'] + got
        c['training'] = int((c['training'] * c['soldiers'] + 30 * got) / max(1, total))
        c['soldiers'] = total
        c['pop'] -= got
        c['order'] = max(0, c['order'] - max(1, amt // 1000 * 2))
        o['acted'] = True
        self.emit({'type': 'recruit', 'fid': fid, 'city': c['id'], 'officer': o['id'], 'delta': got,
                   'text': f"{o['name']} 在 {self.city_name(c['id'])} 徵得 {got} 名士兵（花費 {cost} 金）"})

    def do_train(self, fid, c, o, a):
        if c['training'] >= 100 and c['morale'] >= 100:
            raise GameError('訓練與士氣都已經滿了')
        before = c['training']
        c['training'] = min(100, c['training'] + 5 + o['lead'] // 10)
        c['morale'] = min(100, c['morale'] + 3 + o['war'] // 30)
        o['acted'] = True
        self.emit({'type': 'train', 'fid': fid, 'city': c['id'], 'officer': o['id'], 'delta': c['training'] - before,
                   'text': f"{o['name']} 操練士兵，訓練+{c['training'] - before}"})

    def do_search(self, fid, c, o, a):
        o['acted'] = True
        hidden = [x for x in self.officers_in(c['id'], 'free') if not x['found']]
        name = self.city_name(c['id'])
        if hidden and self.rng.chance(0.45 + o['int'] / 250.0):
            x = self.rng.choice(hidden)
            x['found'] = True
            self.emit({'type': 'search', 'fid': fid, 'city': c['id'], 'officer': o['id'], 'found': x['id'],
                       'text': f"{o['name']} 在 {name} 發現了在野人才 {x['name']}！"})
            return
        r = self.rng.random()
        if r < 0.35:
            g = self.rng.randint(60, 200)
            c['gold'] += g
            self.emit({'type': 'search', 'fid': fid, 'city': c['id'], 'officer': o['id'], 'gold': g,
                       'text': f"{o['name']} 在 {name} 找到了 {g} 金。"})
        elif r < 0.6:
            f = self.rng.randint(200, 600)
            c['food'] += f
            self.emit({'type': 'search', 'fid': fid, 'city': c['id'], 'officer': o['id'], 'food': f,
                       'text': f"{o['name']} 在 {name} 找到了 {f} 糧食。"})
        else:
            self.emit({'type': 'search', 'fid': fid, 'city': c['id'], 'officer': o['id'],
                       'text': f"{o['name']} 在 {name} 四處搜尋，一無所獲。"})

    def hire_chance(self, o, x):
        if x['status'] == 'prisoner':
            if self.is_ruler_of_any(x['id']):
                return 0.0
            p = 0.3 + (o['cha'] - 50) / 120.0 - (x['loyalty'] - 50) / 150.0
        else:
            p = 0.45 + (o['cha'] - 50) / 100.0
        return max(0.08, min(0.92, p))

    def is_ruler_of_any(self, oid):
        return any(f['ruler'] == oid and f['alive'] for f in self.s['factions'].values())

    def do_hire(self, fid, c, o, a):
        x = self.s['officers'].get(a.get('target'))
        ok_free = x and x['status'] == 'free' and x['found'] and x['city'] == c['id']
        ok_pris = x and x['status'] == 'prisoner' and x['city'] == c['id'] and x.get('captor') == fid
        if not (ok_free or ok_pris):
            raise GameError('找不到可以登用的人')
        o['acted'] = True
        p = self.hire_chance(o, x)
        if self.rng.chance(p):
            x.update(status='serve', faction=fid, city=c['id'], loyalty=self.rng.randint(65, 85), acted=True)
            x.pop('captor', None)
            self.emit({'type': 'hire', 'fid': fid, 'city': c['id'], 'officer': o['id'], 'target': x['id'], 'ok': True,
                       'text': f"{x['name']} 答應加入 {self.fname(fid)}！"})
        else:
            if ok_pris:
                x['loyalty'] = max(0, x['loyalty'] - 5)
            self.emit({'type': 'hire', 'fid': fid, 'city': c['id'], 'officer': o['id'], 'target': x['id'], 'ok': False,
                       'text': f"{x['name']} 拒絕了 {o['name']} 的招攬。"})

    def do_reward(self, fid, a):
        x = self.s['officers'].get(a.get('target'))
        if not x or x['faction'] != fid or x['status'] != 'serve':
            raise GameError('找不到這位武將')
        if self.is_ruler(x['id']):
            raise GameError('不能褒賞君主')
        if x['rewarded']:
            raise GameError('這個月已經褒賞過了')
        if x['loyalty'] >= 100:
            raise GameError('忠誠已經滿了')
        c = self.city(x['city'])
        self.pay(c, 100)
        before = x['loyalty']
        x['loyalty'] = min(100, x['loyalty'] + 8)
        x['rewarded'] = True
        self.emit({'type': 'reward', 'fid': fid, 'city': c['id'], 'target': x['id'],
                   'text': f"賞賜 {x['name']} 100 金，忠誠+{x['loyalty'] - before}"})

    def do_release(self, fid, a):
        x = self.s['officers'].get(a.get('target'))
        if not x or x['status'] != 'prisoner' or x.get('captor') != fid:
            raise GameError('找不到這位俘虜')
        x.pop('captor', None)
        self.prisoner_escape(x)

    def do_move(self, fid, c, offs, a):
        to = a.get('to')
        if to not in ADJ[c['id']] or self.city(to)['owner'] != fid:
            raise GameError('只能移動到相鄰的我方城池')
        for o in offs:
            o['city'] = to
            o['acted'] = True
        self.emit({'type': 'move', 'fid': fid, 'city': c['id'], 'to': to, 'officers': [o['id'] for o in offs],
                   'text': f"{'、'.join(o['name'] for o in offs)} 從 {self.city_name(c['id'])} 移動到 {self.city_name(to)}"})

    def do_transport(self, fid, c, o, a):
        to = a.get('to')
        if to not in ADJ[c['id']] or self.city(to)['owner'] != fid:
            raise GameError('只能運輸到相鄰的我方城池')
        gold = max(0, min(int(a.get('gold') or 0), c['gold']))
        food = max(0, min(int(a.get('food') or 0), c['food']))
        sol = max(0, min(int(a.get('soldiers') or 0), c['soldiers']))
        if gold + food + sol <= 0:
            raise GameError('請輸入要運送的數量')
        d = self.city(to)
        c['gold'] -= gold
        c['food'] -= food
        if sol:
            tot = d['soldiers'] + sol
            d['training'] = int((d['training'] * d['soldiers'] + c['training'] * sol) / max(1, tot))
            d['morale'] = int((d['morale'] * d['soldiers'] + c['morale'] * sol) / max(1, tot))
            d['soldiers'] = tot
            c['soldiers'] -= sol
        d['gold'] += gold
        d['food'] += food
        o['acted'] = True
        parts = [p for p in (f'{gold} 金' if gold else '', f'{food} 糧' if food else '', f'{sol} 兵' if sol else '') if p]
        self.emit({'type': 'transport', 'fid': fid, 'city': c['id'], 'to': to, 'officer': o['id'], 'gold': gold, 'food': food,
                   'soldiers': sol, 'text': f"{o['name']} 從 {self.city_name(c['id'])} 運送 {'、'.join(parts)} 到 {self.city_name(to)}"})

    # ---------------- 出征與戰鬥 ----------------
    def do_attack(self, fid, c, offs, a):
        to = a.get('to')
        if to not in ADJ[c['id']]:
            raise GameError('只能攻打相鄰的城池')
        d = self.city(to)
        if d['owner'] == fid:
            raise GameError('不能攻打自己的城池')
        if len(offs) > 3:
            raise GameError('一次最多派出 3 位武將')
        sol = int(a.get('soldiers') or 0)
        if sol < 500:
            raise GameError('出征至少要 500 名士兵')
        if sol > c['soldiers']:
            raise GameError('城中士兵不足')
        food = sol // 10
        self.pay(c, 0, food)
        c['soldiers'] -= sol
        for o in offs:
            o['acted'] = True
            o['city'] = None   # 出征中
            o['marching'] = c['id']
        name_from, name_to = self.city_name(c['id']), self.city_name(to)
        self.emit({'type': 'march', 'fid': fid, 'city': c['id'], 'to': to, 'officers': [o['id'] for o in offs], 'soldiers': sol,
                   'text': f"{offs[0]['name']} 率兵 {sol} 從 {name_from} 出征 {name_to}！"})
        defenders = sorted(self.officers_in(to), key=lambda x: -(x['lead'] + x['war']))[:3]
        if d['soldiers'] <= 0 and not defenders:
            self.s['battle'] = self._battle_obj(fid, c, offs, sol, d, [])
            self.s['battle']['result'] = 'att_win'
            self.finish_battle()
            return
        self.s['battle'] = self._battle_obj(fid, c, offs, sol, d, defenders)
        self.s['phase'] = 'battle'
        b = self.s['battle']
        self.emit({'type': 'battle_start', 'fid': fid, 'def_fid': d['owner'], 'city': c['id'], 'to': to,
                   'att_officers': b['att']['officers'], 'def_officers': b['def']['officers'],
                   'att_soldiers': sol, 'def_soldiers': d['soldiers'], 'wall': b['wall'], 'terrain': D.CITIES[to][3],
                   'text': f"{self.fname(fid)} 軍與 {self.fname(d['owner'])} 軍在 {name_to} 展開激戰！"})

    def _battle_obj(self, fid, c, offs, sol, d, defenders):
        return {
            'from': c['id'], 'to': d['id'], 'round': 0, 'result': None, 'city_def': True,
            'wall': d['defense'], 'choice': {'att': None, 'def': None}, 'history': [],
            'att': {'fid': fid, 'officers': [o['id'] for o in offs], 'soldiers': sol,
                    'training': c['training'], 'morale': c['morale'], 'start': sol},
            'def': {'fid': d['owner'], 'officers': [o['id'] for o in defenders], 'soldiers': d['soldiers'],
                    'training': d['training'], 'morale': min(100, d['morale'] + 5), 'start': d['soldiers']},
        }

    def battle_role(self, fid):
        b = self.s['battle']
        if not b:
            return None
        if b['att']['fid'] == fid:
            return 'att'
        if b['def']['fid'] == fid:
            return 'def'
        return None

    def battle_choose(self, fid, tactic, role=None):
        b = self.s['battle']
        if self.s['phase'] != 'battle' or not b:
            raise GameError('現在沒有戰鬥')
        role = role or self.battle_role(fid)
        if role is None:
            raise GameError('你不在這場戰鬥中')
        if b['choice'][role]:
            raise GameError('這回合已經下過令了')
        if tactic not in B.options(self, b, role):
            raise GameError('不能使用這個戰術')
        b['choice'][role] = tactic
        if b['choice']['att'] and b['choice']['def']:
            for ev in B.resolve_round(self, b):
                self.emit(ev)
            if b['result']:
                self.finish_battle()

    def auto_battle_choice(self, role):
        """電腦（或無主城守軍）替某一方選戰術。"""
        b = self.s['battle']
        fid = b[role]['fid']
        level = self.s['players'].get(fid, {}).get('level', 'normal') if fid else 'normal'
        t = B.ai_tactic(self, b, role, level)
        self.battle_choose(fid, t, role)
        return t

    def finish_battle(self):
        s = self.s
        b = s['battle']
        A, Dd = b['att'], b['def']
        src, dst = self.city(b['from']), self.city(b['to'])
        att_fid, def_fid = A['fid'], Dd['fid']
        res = b['result']
        att_offs = [self.officer(o) for o in A['officers']]
        # 單挑被擒的人
        for cap in b.get('captured', []):
            x = self.officer(cap['id'])
            captor = A['fid'] if cap['by'] == 'att' else Dd['fid']
            if captor:
                x['prev_faction'] = x['faction']
                x.update(status='prisoner', captor=captor, faction=None,
                         city=b['to'] if cap['by'] == 'att' and res == 'att_win' else (b['from'] if cap['by'] == 'att' else b['to']))
        for o in s['officers'].values():
            o.pop('marching', None)
        if res == 'att_win':
            old_owner = dst['owner']
            dst['owner'] = att_fid
            dst['soldiers'] = max(0, A['soldiers'])
            surrender = int(max(0, Dd['soldiers']) * 0.3)
            dst['soldiers'] += surrender
            dst['training'] = A['training']
            dst['morale'] = max(30, A['morale'])
            dst['defense'] = b['wall']
            dst['gold'] //= 2
            dst['food'] //= 2
            dst['order'] = max(20, dst['order'] - 15)
            for o in att_offs:
                o['city'] = dst['id']
            fled, caught = [], []
            for o in list(self.officers_in(dst['id'], 'serve', old_owner)) if old_owner else []:
                escape = [n for n in ADJ[dst['id']] if self.city(n)['owner'] == old_owner]
                if escape and not self.rng.chance(0.35):
                    o['city'] = self.rng.choice(escape)
                    fled.append(o['name'])
                else:
                    o['prev_faction'] = old_owner
                    o.update(status='prisoner', captor=att_fid, faction=None, city=dst['id'])
                    caught.append(o['name'])
            # 原本關在這座城的俘虜
            for o in self.s['officers'].values():
                if o['status'] == 'prisoner' and o['city'] == dst['id'] and o.get('captor') == old_owner and old_owner:
                    o.pop('captor', None)
                    if o.get('prev_faction') == att_fid:
                        o.update(status='serve', faction=att_fid)
                    else:
                        o.update(status='free', faction=None, found=True)
            text = f"{self.fname(att_fid)} 攻下了 {self.city_name(dst['id'])}！"
            if caught:
                text += f" 俘虜了 {'、'.join(caught)}。"
            if fled:
                text += f" {'、'.join(fled)} 逃走了。"
            self.emit({'type': 'capture', 'fid': att_fid, 'from_fid': old_owner, 'city': dst['id'], 'caught': caught, 'fled': fled, 'text': text})
            if old_owner and old_owner in s['factions']:
                f = s['factions'][old_owner]
                if f['capital'] == dst['id']:
                    rest = self.cities_of(old_owner)
                    if rest:
                        f['capital'] = rest[0]['id']
                ruler = self.officer(f['ruler'])
                if ruler['status'] == 'prisoner' and f['alive']:
                    ruler_name = ruler['name']
                    if self.cities_of(old_owner):
                        self.succession(old_owner)
                        self.emit({'type': 'info', 'text': f"{ruler_name} 被俘，{self.fname(old_owner)} 改立新主。"})
        else:
            # 進攻失敗或撤退：殘兵回原城
            back = max(0, A['soldiers'])
            if src['owner'] == att_fid:
                src['soldiers'] += back
                for o in att_offs:
                    o['city'] = src['id']
            else:
                for o in att_offs:
                    cs = self.cities_of(att_fid)
                    o['city'] = cs[0]['id'] if cs else src['id']
            dst['soldiers'] = max(0, Dd['soldiers'])
            dst['defense'] = b['wall']
            dst['morale'] = max(20, Dd['morale'])
            word = {'retreat': '撤退了', 'timeout': '久攻不下，只好退兵', 'def_win': '大敗而回'}[res]
            self.emit({'type': 'repelled', 'fid': att_fid, 'def_fid': def_fid, 'city': dst['id'], 'result': res,
                       'text': f"{self.fname(att_fid)} 軍{word}，{self.city_name(dst['id'])} 守住了！"})
        self.emit({'type': 'battle_end', 'result': res, 'fid': att_fid, 'def_fid': def_fid, 'city': dst['id'], 'nolog': True,
                   'att_soldiers': max(0, A['soldiers']), 'def_soldiers': max(0, Dd['soldiers'])})
        s['battle'] = None
        s['phase'] = 'command'
        self.check_victory()

    # ---------------- 查詢 ----------------
    def pending(self):
        """現在等誰：[{fid, kind:'command'|'tactic', role}]。fid 為 None 表示無主城守軍。"""
        s = self.s
        if s['phase'] == 'over':
            return []
        if s['phase'] == 'battle':
            b = s['battle']
            return [{'fid': b[r]['fid'], 'kind': 'tactic', 'role': r} for r in ('att', 'def') if not b['choice'][r]]
        return [{'fid': self.current(), 'kind': 'command'}]

    def controller(self, fid):
        """這個勢力現在由誰操作：human / remote / ai（軍師代打也算 ai）。"""
        if fid is None:
            return 'ai'
        p = self.s['players'].get(fid, {})
        if p.get('proxy'):
            return 'ai'
        return p.get('kind', 'ai')

    def snapshot(self):
        return copy.deepcopy(self.s)


def months_between(s):
    return (s['year'] - s['start_year']) * 12 + s['month'] - s['start_month']


def fmt_num(n):
    return f'{n:,}'


def dist(a, b):
    ca, cb = D.CITIES[a], D.CITIES[b]
    return math.hypot(ca[1] - cb[1], ca[2] - cb[2])
