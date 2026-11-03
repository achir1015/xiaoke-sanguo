# -*- coding: utf-8 -*-
"""電腦勢力與 AI 軍師：列出所有可行指令並評分，電腦挑最高分的執行，軍師把前幾名說給玩家聽。

風格（軍師個性）會改變評分：進攻型愛出兵、守成型重城防訓練、內政型重開發、謀略型重人才與以弱擊強。
"""
from collections import deque

from . import battle as B
from . import data as D
from .game import ADJ, DEVELOP_COST, ROAD_KIND

STYLE_W = {
    'attack':  {'attack': 1.35, 'recruit': 1.15, 'train': 1.1, 'develop': 0.9, 'defense': 0.85, 'people': 1.0},
    'defend':  {'attack': 0.75, 'recruit': 1.2, 'train': 1.25, 'develop': 1.0, 'defense': 1.4, 'people': 1.0},
    'economy': {'attack': 0.85, 'recruit': 0.95, 'train': 0.95, 'develop': 1.4, 'defense': 1.0, 'people': 1.1},
    'scheme':  {'attack': 1.05, 'recruit': 1.0, 'train': 1.0, 'develop': 1.0, 'defense': 1.0, 'people': 1.5},
    'balance': {'attack': 1.0, 'recruit': 1.0, 'train': 1.0, 'develop': 1.0, 'defense': 1.0, 'people': 1.0},
}
ATTACK_RATIO = {'attack': 0.95, 'defend': 1.45, 'economy': 1.25, 'scheme': 1.1, 'balance': 1.15}
LEVEL_RATIO = {'easy': 1.25, 'normal': 1.0, 'hard': 0.9}


def quality(c, offs):
    lead = max([o['lead'] for o in offs] or [45])
    war = max([o['war'] for o in offs] or [45])
    return (0.6 + c['training'] / 250.0) * (0.6 + c['morale'] / 250.0) * (lead + war) / 140.0


def city_strength(g, cid):
    c = g.city(cid)
    offs = sorted(g.officers_in(cid), key=lambda o: -(o['lead'] + o['war']))[:3]
    wall = 1.0 / (1.0 - c['defense'] / (c['defense'] + 1500.0))
    return c['soldiers'] * quality(c, offs) * wall


def front_distance(g, fid):
    """每座我方城到最近邊境（相鄰非我方城）的距離。"""
    dist = {}
    q = deque()
    for c in g.cities_of(fid):
        if any(g.city(n)['owner'] != fid for n in ADJ[c['id']]):
            dist[c['id']] = 0
            q.append(c['id'])
    while q:
        x = q.popleft()
        for n in ADJ[x]:
            if n not in dist and g.city(n)['owner'] == fid:
                dist[n] = dist[x] + 1
                q.append(n)
    return dist


def threat(g, fid, cid, exclude=None):
    t = 0.0
    for n in ADJ[cid]:
        o = g.city(n)['owner']
        if n != exclude and o and o != fid:
            t = max(t, city_strength(g, n) * 0.7)
    return t


def best(offs, key):
    return max(offs, key=lambda o: o[key]) if offs else None


def candidates(g, fid, style='balance', level='normal'):
    """回傳 [(分數, 指令, 理由)]，分數越高越好。"""
    W = STYLE_W.get(style, STYLE_W['balance'])
    out = []
    fd = front_distance(g, fid)
    my_cities = g.cities_of(fid)
    n_off = sum(1 for o in g.s['officers'].values() if o['faction'] == fid and o['status'] == 'serve')
    for c in my_cities:
        cid = c['id']
        cname = g.city_name(cid)
        ready = [o for o in g.officers_in(cid, 'serve', fid) if not o['acted']]
        base = D.CITIES[cid]
        front = fd.get(cid, 9) == 0
        thr = threat(g, fid, cid)
        mine = city_strength(g, cid)
        # 褒賞（不佔武將行動）
        for o in g.officers_in(cid, 'serve', fid):
            if not g.is_ruler(o['id']) and o['loyalty'] < 60 and not o['rewarded'] and c['gold'] >= 300:
                out.append((30 + (60 - o['loyalty']) * W['people'], {'type': 'reward', 'target': o['id']},
                            f"{o['name']} 忠誠只有 {o['loyalty']}，賞賜 100 金可以安撫人心。"))
        if not ready:
            continue
        # 登用在野與俘虜
        for x in list(g.officers_in(cid, 'free')) + list(g.officers_in(cid, 'prisoner')):
            if x['status'] == 'free' and not x['found']:
                continue
            if x['status'] == 'prisoner' and x.get('captor') != fid:
                continue
            o = best(ready, 'cha')
            p = g.hire_chance(o, x)
            if p <= 0:
                continue
            talent = max(x['lead'], x['war'], x['int'], x['pol'])
            out.append(((40 + talent * 0.4) * p * 1.6 * W['people'], {'type': 'hire', 'city': cid, 'officer': o['id'], 'target': x['id']},
                        f"{cname} 有{'俘虜' if x['status'] == 'prisoner' else '在野人才'} {x['name']}，請 {o['name']} 前往招攬（成功率約 {int(p * 100)}%）。"))
        # 出征
        attackers = sorted(ready, key=lambda o: -(o['lead'] + o['war']))[:3]
        if attackers and c['soldiers'] >= 2000:
            for n in ADJ[cid]:
                d = g.city(n)
                if d['owner'] == fid:
                    continue
                keep = threat(g, fid, cid, exclude=n) * 0.55
                keep = max(keep, 800 if front else 300)
                send = int(min(c['soldiers'] - keep, c['food'] * 10) // 500 * 500)
                if send < 1500:
                    continue
                q_att = (0.6 + c['training'] / 250.0) * (0.6 + c['morale'] / 250.0) * \
                    (max(o['lead'] for o in attackers) + max(o['war'] for o in attackers)) / 140.0
                enemy = city_strength(g, n)
                kind = ROAD_KIND.get((cid, n))
                road = 0.85 if kind == 'river' else (0.9 if kind in ('pass', 'mount') else 1.0)
                ratio = send * q_att * road / max(1.0, enemy)
                need = ATTACK_RATIO.get(style, 1.35) * LEVEL_RATIO.get(level, 1.0)
                if ratio < need:
                    continue
                sc = (55 + 25 * min(2.0, ratio - need)) * W['attack']
                if d['owner'] is None:
                    sc += 8
                elif g.s['factions'][d['owner']]['capital'] == n:
                    sc += 10
                if style == 'scheme' and d['owner'] and len(g.cities_of(d['owner'])) <= 2:
                    sc += 8
                tgt = g.fname(d['owner']) if d['owner'] else '無主'
                out.append((sc, {'type': 'attack', 'city': cid, 'to': n, 'officers': [o['id'] for o in attackers], 'soldiers': send},
                            f"{g.city_name(n)}（{tgt}）守軍約 {d['soldiers']:,}，我軍可派 {attackers[0]['name']} 率 {send:,} 兵出征，勝算頗高。"))
        # 徵兵
        o = best(ready, 'cha')
        want = max(thr * 1.15, 7000 if front else 3000)
        upkeep = c['soldiers'] * 0.025 * 12
        harvest = c['farm'] * (0.3 * 12 + 5) * (0.6 + c['order'] / 250.0)
        food_ok = c['food'] > c['soldiers'] * 0.5 or harvest > upkeep * 1.1
        if c['soldiers'] < want and c['gold'] >= 150 and c['pop'] > 8000 and food_ok:
            amt = int(min(5000, (want - c['soldiers']), (c['gold'] - 50) * 10, c['pop'] // 5) // 500 * 500)
            if amt >= 500:
                urgency = min(1.5, (want - c['soldiers']) / max(1000.0, want))
                out.append(((35 + 35 * urgency + (12 if front else 0)) * W['recruit'],
                            {'type': 'recruit', 'city': cid, 'officer': o['id'], 'amount': amt},
                            f"{cname} 兵力 {c['soldiers']:,} 偏少{'，鄰近敵軍虎視眈眈' if thr > c['soldiers'] else ''}，建議徵兵 {amt:,}。"))
        # 訓練
        if c['training'] < 85 or c['morale'] < 75:
            o = best(ready, 'lead')
            gap = max(85 - c['training'], 75 - c['morale'])
            out.append(((22 + gap * 0.7 + (10 if front else 0)) * W['train'], {'type': 'train', 'city': cid, 'officer': o['id']},
                        f"{cname} 訓練 {c['training']}、士氣 {c['morale']}，請 {o['name']} 操練兵馬。"))
        # 城防
        if c['defense'] < base[6] and c['gold'] >= DEVELOP_COST + 100:
            o = best(ready, 'lead')
            ratio = c['defense'] / base[6]
            out.append(((14 + (1 - ratio) * 25 + (14 if front and thr > mine * 0.6 else 0)) * W['defense'],
                        {'type': 'defense', 'city': cid, 'officer': o['id']},
                        f"{cname} 城防 {c['defense']}／{base[6]}，加固城牆可以減少守城傷亡。"))
        # 開墾、商業
        for key, idx, label, why in (('farm', 4, 'farm', '糧食'), ('trade', 5, 'trade', '金錢')):
            if c[key] < base[idx] and c['gold'] >= DEVELOP_COST + 80:
                o = best(ready, 'pol')
                ratio = c[key] / base[idx]
                lowfood = 1.4 if key == 'farm' and c['food'] < c['soldiers'] * 0.6 else 1.0
                lowgold = 1.3 if key == 'trade' and c['gold'] < 400 else 1.0
                out.append(((18 + (1 - ratio) * 30) * lowfood * lowgold * W['develop'] * (0.85 if front else 1.05),
                            {'type': key, 'city': cid, 'officer': o['id']},
                            f"{cname} {'農業' if key == 'farm' else '商業'} {c[key]}／{base[idx]}，請 {o['name']} 發展以增加{why}。"))
        # 撫民
        if c['order'] < 60 and c['food'] >= 200:
            o = best(ready, 'cha')
            out.append(((20 + (60 - c['order']) * 0.8) * W['develop'], {'type': 'order', 'city': cid, 'officer': o['id']},
                        f"{cname} 民心只有 {c['order']}，請 {o['name']} 撫恤百姓。"))
        # 搜索
        o = best(ready, 'int')
        hidden = [x for x in g.officers_in(cid, 'free') if not x['found']]
        sc = 6 + (5 if n_off < len(my_cities) * 2 else 0) + (8 if hidden else 0) + (4 if c['gold'] < 200 else 0)
        out.append((sc * W['people'], {'type': 'search', 'city': cid, 'officer': o['id']},
                    f"在 {cname} 搜索，或許能找到人才或錢糧。"))
        # 後方往前線運兵、調將
        dist = fd.get(cid, 0)
        if dist > 0:
            toward = [n for n in ADJ[cid] if g.city(n)['owner'] == fid and fd.get(n, 9) < dist]
            if toward:
                n = min(toward, key=lambda x: fd.get(x, 9))
                sol = int(max(0, c['soldiers'] - 1500) // 500 * 500)
                if sol >= 1500:
                    o = best(ready, 'lead')
                    out.append((40 + min(20, sol / 500), {'type': 'transport', 'city': cid, 'officer': o['id'], 'to': n, 'soldiers': sol,
                                                          'gold': max(0, c['gold'] - 600) if c['gold'] > 1500 else 0},
                                f"{cname} 在後方，把 {sol:,} 兵送往 {g.city_name(n)} 支援前線。"))
                if len(g.officers_in(cid, 'serve', fid)) > 2 and len(g.officers_in(n, 'serve', fid)) < 4:
                    mover = max(ready, key=lambda o: o['lead'] + o['war'])
                    if not g.is_ruler(mover['id']) or len(ready) > 3:
                        out.append((24, {'type': 'move', 'city': cid, 'to': n, 'officers': [mover['id']]},
                                    f"讓 {mover['name']} 移往 {g.city_name(n)}，加強前線。"))
    out.sort(key=lambda x: -x[0])
    return out


def decide(g, fid, style='balance', level='normal'):
    """電腦選下一個指令；沒有值得做的就結束回合。"""
    for sc, act, why in candidates(g, fid, style, level):
        if sc < 12:
            break
        if level == 'easy' and g.rng.chance(0.25):
            continue
        return act
    return {'type': 'end'}


def advise(g, fid, style='balance', level='normal', limit=3):
    """軍師建議：前幾名（不同種類）指令與理由。"""
    res = []
    seen = set()
    for sc, act, why in candidates(g, fid, style, level):
        if act['type'] in seen:
            continue
        seen.add(act['type'])
        res.append({'score': round(sc, 1), 'action': act, 'reason': why})
        if len(res) >= limit:
            break
    return res


def advise_tactic(g, role):
    b = g.s['battle']
    scores = B.tactic_scores(g, b, role)
    me, op = b[role], b['def' if role == 'att' else 'att']
    sm, so = B.side_stats(g, me), B.side_stats(g, op)
    best_t = scores[0][0]
    why = {
        '突擊': '敵軍若放箭或用計，全軍衝鋒最能打亂其陣腳。',
        '齊射': '穩紮穩打，弓弩齊發可消耗固守之敵。',
        '固守': '敵將勇猛，結陣固守、以逸待勞，待其衝鋒時反擊。',
        '計策': f"我軍智謀（{sm['int']}）勝過敵軍（{so['int']}），火計伏兵可破其守陣。",
    }[best_t]
    extra = ''
    if '單挑' in B.options(g, b, role):
        dm, do = B.duelist(g, me), B.duelist(g, op)
        if dm and do and dm['war'] - do['war'] >= 8:
            return {'tactic': '單挑', 'reason': f"我方 {dm['name']}（武力 {dm['war']}）遠勝 {do['name']}（{do['war']}），出陣單挑可大振士氣！"}
    if role == 'att' and (me['soldiers'] < op['soldiers'] * 0.35 or me['morale'] < 22):
        return {'tactic': '撤退', 'reason': '兵力士氣都已不足，留得青山在，不如先行撤退。'}
    return {'tactic': best_t, 'reason': why + extra}
