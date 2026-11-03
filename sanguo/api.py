# -*- coding: utf-8 -*-
"""引擎對外介面：所有呼叫都是 JSON 進、JSON 出。

桌面版由 Python 伺服器呼叫；網頁版與手機版用 Pyodide 在瀏覽器裡執行同一份程式。
"""
from . import ai
from . import data as D
from .game import Game, GameError, static_data


class Engine:
    def __init__(self):
        self.g = None

    def call(self, method, params=None):
        params = params or {}
        fn = getattr(self, 'm_' + method, None)
        if fn is None:
            return {'ok': False, 'error': f'未知的功能：{method}'}
        try:
            res = fn(**params)
            if res is None:
                res = {}
            res.setdefault('ok', True)
            return res
        except GameError as e:
            return {'ok': False, 'error': str(e), **self._view()}

    # ---------------- 資料 ----------------
    def _view(self, events=None):
        if not self.g:
            return {'state': None}
        g = self.g
        return {
            'state': g.s, 'events': events or [],
            'pending': g.pending(),
            'ctrl': {fid: g.controller(fid) for fid in g.s['factions']},
        }

    def m_static(self):
        return {'static': static_data()}

    def m_view(self):
        return self._view()

    def m_new_game(self, scenario='s194', players=None, seed=1, limit_months=0, victory='unify', spectate=False):
        self.g = Game.new(scenario, players or {}, seed, limit_months, victory)
        self.g.s['spectate'] = bool(spectate)
        ev = self.g.events
        self.g.events = []
        return self._view(ev)

    def m_load(self, state):
        if not isinstance(state, dict) or state.get('version') != 1 or 'cities' not in state:
            raise GameError('存檔格式不正確')
        self.g = Game(state)
        return self._view()

    def m_save(self):
        return {'state': self.g.s if self.g else None}

    # ---------------- 行動 ----------------
    def m_act(self, fid, action):
        if not self.g:
            raise GameError('還沒有開始遊戲')
        ev = self.g.act(fid, action)
        return self._view(ev)

    def m_ai_step(self):
        """若現在輪到電腦（含軍師代打、無主守軍），替它走一步。"""
        g = self.g
        if not g or g.s['phase'] == 'over':
            return {**self._view(), 'idle': True}
        g.events = []
        for p in g.pending():
            fid = p['fid']
            if g.controller(fid) != 'ai':
                continue
            if p['kind'] == 'tactic':
                g.auto_battle_choice(p['role'])
            else:
                style, level = self._style(fid)
                act = ai.decide(g, fid, style, level)
                try:
                    g.act(fid, act)
                except GameError:
                    g.act(fid, {'type': 'end'})
            ev = g.events
            g.events = []
            return self._view(ev)
        return {**self._view(), 'idle': True}

    def _style(self, fid):
        p = self.g.s['players'].get(fid, {})
        level = p.get('level', 'normal')
        style = 'balance'
        adv = p.get('advisor')
        if adv:
            for a in D.ADVISORS:
                if a[0] == adv:
                    style = a[3]
        elif p.get('kind') == 'ai':
            # 電腦勢力依君主個性
            ruler = self.g.officer(self.g.s['factions'][fid]['ruler'])
            if ruler['war'] >= 90:
                style = 'attack'
            elif ruler['int'] >= 85:
                style = 'scheme'
            elif ruler['pol'] >= 80:
                style = 'economy'
        if p.get('proxy') and level not in ('normal', 'hard'):
            level = 'normal'
        return style, level

    def m_advise(self, fid, limit=3):
        if not self.g:
            raise GameError('還沒有開始遊戲')
        style, level = self._style(fid)
        if self.g.s['phase'] == 'battle':
            role = self.g.battle_role(fid)
            if role:
                return {'tactic': ai.advise_tactic(self.g, role)}
        return {'advice': ai.advise(self.g, fid, style, 'normal', limit)}

    def m_set_player(self, fid, patch):
        if not self.g or fid not in self.g.s['players']:
            raise GameError('找不到這個勢力')
        allowed = {'proxy', 'advisor', 'kind', 'name', 'portrait', 'peer', 'level'}
        for k, v in (patch or {}).items():
            if k in allowed:
                self.g.s['players'][fid][k] = v
        return self._view()

    def m_hire_odds(self, officer, target):
        g = self.g
        return {'p': g.hire_chance(g.officer(officer), g.officer(target))}

    def m_score(self):
        g = self.g
        return {'scores': {fid: g.score(fid) for fid, f in g.s['factions'].items() if f['alive']}}
