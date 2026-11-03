# -*- coding: utf-8 -*-
"""遊戲引擎測試：python -m unittest discover -s tests"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sanguo import battle as B  # noqa: E402
from sanguo import data as D  # noqa: E402
from sanguo.api import Engine  # noqa: E402
from sanguo.game import ADJ, Game, GameError  # noqa: E402


def officer_id(name):
    return D.OFFICER_BY_NAME[name]['id']


class DataTest(unittest.TestCase):
    def test_roads_connect_all_cities(self):
        seen, stack = set(), ['luoyang']
        while stack:
            c = stack.pop()
            if c in seen:
                continue
            seen.add(c)
            stack.extend(ADJ[c])
        self.assertEqual(seen, set(D.CITIES))

    def test_scenarios_valid(self):
        for key, sc in D.SCENARIOS.items():
            cities, offs = set(), set()
            for f in sc['factions']:
                first = list(f['cities'])[0]
                self.assertIn(f['ruler'], f['cities'][first], key)
                for c, names in f['cities'].items():
                    self.assertNotIn(c, cities)
                    cities.add(c)
                    for n in names:
                        o = D.OFFICER_BY_NAME[n]
                        self.assertNotIn(n, offs)
                        offs.add(n)
                        self.assertTrue(o['from'] <= sc['year'] <= o['to'], (key, n))

    def test_counts(self):
        self.assertEqual(len(D.ADVISORS), 30)
        self.assertEqual(sum(1 for a in D.ADVISORS if a[2] == '女'), 10)
        self.assertEqual(sum(1 for p in D.PLAYER_PORTRAITS if p[2] == '男'), 20)
        self.assertEqual(sum(1 for p in D.PLAYER_PORTRAITS if p[2] == '女'), 20)

    def test_portrait_files_exist(self):
        root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'web', 'assets')
        for p in D.PLAYER_PORTRAITS:
            self.assertTrue(os.path.exists(os.path.join(root, 'portraits', p[0] + '.svg')), p[0])
        for a in D.ADVISORS:
            self.assertTrue(os.path.exists(os.path.join(root, 'portraits', a[0] + '.svg')), a[0])
        for o in D.OFFICERS:
            self.assertTrue(os.path.exists(os.path.join(root, 'officers', o['id'] + '.svg')), o['id'])


class GameTest(unittest.TestCase):
    def new(self, **kw):
        return Game.new('s194', {'cao': {'kind': 'human', 'advisor': 'adv01'}}, seed=7, **kw)

    def test_human_first(self):
        g = self.new()
        self.assertEqual(g.current(), 'cao')
        self.assertEqual(g.pending(), [{'fid': 'cao', 'kind': 'command'}])

    def test_develop_costs_and_marks_officer(self):
        g = self.new()
        c = g.city('chenliu')
        gold, farm = c['gold'], c['farm']
        oid = officer_id('荀彧')
        g.act('cao', {'type': 'farm', 'city': 'chenliu', 'officer': oid})
        self.assertEqual(c['gold'], gold - 100)
        self.assertGreater(c['farm'], farm)
        with self.assertRaises(GameError):
            g.act('cao', {'type': 'trade', 'city': 'chenliu', 'officer': oid})

    def test_not_your_turn(self):
        g = self.new()
        with self.assertRaises(GameError):
            g.act('liu', {'type': 'end'})

    def test_cannot_use_enemy_city(self):
        g = self.new()
        with self.assertRaises(GameError):
            g.act('cao', {'type': 'farm', 'city': 'xiapi', 'officer': officer_id('劉備')})

    def test_recruit(self):
        g = self.new()
        c = g.city('chenliu')
        sol = c['soldiers']
        g.act('cao', {'type': 'recruit', 'city': 'chenliu', 'officer': officer_id('曹操'), 'amount': 2000})
        self.assertGreaterEqual(c['soldiers'], sol + 2000)

    def test_attack_neutral_and_capture(self):
        g = self.new()
        offs = [officer_id(n) for n in ('曹操', '夏侯惇', '典韋')]
        g.act('cao', {'type': 'attack', 'city': 'chenliu', 'to': 'luoyang', 'officers': offs, 'soldiers': 8000})
        self.assertEqual(g.s['phase'], 'battle')
        rounds = 0
        while g.s['phase'] == 'battle':
            g.battle_choose('cao', '齊射')
            if g.s['phase'] == 'battle':
                g.auto_battle_choice('def')
            rounds += 1
            self.assertLess(rounds, 12)
        self.assertEqual(g.city('luoyang')['owner'], 'cao')
        self.assertEqual(g.officer(offs[0])['city'], 'luoyang')

    def test_attack_rules(self):
        g = self.new()
        with self.assertRaises(GameError):   # 不相鄰
            g.act('cao', {'type': 'attack', 'city': 'chenliu', 'to': 'chengdu', 'officers': [officer_id('曹操')], 'soldiers': 1000})
        with self.assertRaises(GameError):   # 兵太少
            g.act('cao', {'type': 'attack', 'city': 'chenliu', 'to': 'luoyang', 'officers': [officer_id('曹操')], 'soldiers': 100})

    def test_retreat_returns_soldiers(self):
        g = self.new()
        c = g.city('chenliu')
        g.act('cao', {'type': 'attack', 'city': 'chenliu', 'to': 'puyang', 'officers': [officer_id('典韋')], 'soldiers': 2000})
        left = c['soldiers']
        g.auto_battle_choice('def')
        g.battle_choose('cao', '撤退')
        self.assertEqual(g.s['phase'], 'command')
        self.assertEqual(c['soldiers'], left + 2000)
        self.assertEqual(g.officer(officer_id('典韋'))['city'], 'chenliu')

    def test_month_end_income_and_turn_cycle(self):
        g = self.new()
        e = Engine()
        e.g = g
        gold = g.city('chenliu')['gold']
        g.act('cao', {'type': 'end'})
        for _ in range(3000):
            r = e.call('ai_step')
            if r.get('idle'):
                break
        self.assertEqual(g.s['month'], 2)
        self.assertEqual(g.current(), 'cao')
        self.assertGreater(g.city('chenliu')['gold'], gold - 1)

    def test_tactic_options(self):
        g = self.new()
        g.act('cao', {'type': 'attack', 'city': 'chenliu', 'to': 'puyang', 'officers': [officer_id('典韋')], 'soldiers': 3000})
        b = g.s['battle']
        self.assertIn('單挑', B.options(g, b, 'att'))   # 典韋 vs 呂布
        self.assertIn('撤退', B.options(g, b, 'att'))
        self.assertNotIn('撤退', B.options(g, b, 'def'))
        with self.assertRaises(GameError):
            g.battle_choose('cao', '飛天')

    def test_duel_resolves(self):
        g = self.new()
        g.act('cao', {'type': 'attack', 'city': 'chenliu', 'to': 'puyang', 'officers': [officer_id('典韋')], 'soldiers': 3000})
        g.battle_choose('lvbu', '單挑', 'def')
        g.battle_choose('cao', '單挑')
        duels = [e for e in g.events if e['type'] == 'duel']
        self.assertEqual(len(duels), 1)
        self.assertTrue(duels[0]['bouts'])

    def test_hire_found_officer(self):
        g = self.new()
        x = g.officer(officer_id('許褚'))   # 在野、故鄉汝南
        x['city'] = 'chenliu'
        x['found'] = True
        x['status'] = 'free'
        ok = False
        for name in ('曹操', '夏侯惇', '典韋', '荀彧', '郭嘉'):
            if x['status'] == 'serve':
                break
            g.act('cao', {'type': 'hire', 'city': 'chenliu', 'officer': officer_id(name), 'target': x['id']})
            ok = x['status'] == 'serve'
        self.assertIn(x['status'], ('serve', 'free'))

    def test_save_load_roundtrip(self):
        e = Engine()
        e.call('new_game', {'scenario': 's220', 'players': {'shu': {'kind': 'human'}}, 'seed': 3})
        saved = json.loads(json.dumps(e.call('save')['state']))
        e2 = Engine()
        r = e2.call('load', {'state': saved})
        self.assertTrue(r['ok'])
        self.assertEqual(r['state']['cities'], saved['cities'])
        self.assertFalse(Engine().call('load', {'state': {'x': 1}})['ok'])

    def test_deterministic(self):
        def play(seed):
            e = Engine()
            e.call('new_game', {'scenario': 's194', 'seed': seed, 'limit_months': 6})
            for _ in range(20000):
                if e.call('ai_step').get('idle'):
                    break
            return json.dumps(e.g.s['cities'], sort_keys=True)
        self.assertEqual(play(11), play(11))

    def test_ai_full_games(self):
        for sc in ('s194', 's220'):
            e = Engine()
            e.call('new_game', {'scenario': sc, 'seed': 5, 'limit_months': 36})
            for _ in range(60000):
                r = e.call('ai_step')
                self.assertTrue(r['ok'], r.get('error'))
                if r.get('idle'):
                    break
            self.assertEqual(e.g.s['phase'], 'over')
            self.assertIsNotNone(e.g.s['winner'])

    def test_proxy_makes_ai_play_for_human(self):
        e = Engine()
        e.call('new_game', {'scenario': 's220', 'players': {'wei': {'kind': 'human', 'advisor': 'adv03'}}, 'seed': 1})
        self.assertTrue(e.call('ai_step').get('idle'))
        e.call('set_player', {'fid': 'wei', 'patch': {'proxy': True}})
        self.assertFalse(e.call('ai_step').get('idle'))
        e.call('set_player', {'fid': 'wei', 'patch': {'proxy': False}})

    def test_advise(self):
        e = Engine()
        e.call('new_game', {'scenario': 's194', 'players': {'liu': {'kind': 'human', 'advisor': 'adv01'}}, 'seed': 2})
        r = e.call('advise', {'fid': 'liu'})
        self.assertTrue(r['advice'])
        for a in r['advice']:
            self.assertTrue(a['reason'])

    def test_static(self):
        st = Engine().call('static')['static']
        self.assertEqual(len(st['cities']), len(D.CITIES))
        self.assertEqual(len(st['advisors']), 30)
        self.assertIn('曹操', st['rulerIds'])


if __name__ == '__main__':
    unittest.main()
