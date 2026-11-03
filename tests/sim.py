# AI 對 AI 自動對局：檢查規則不會卡住或出錯，並統計遊戲節奏
import sys, time, collections, json
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.dirname(__import__('os').path.abspath(__file__))))
from sanguo.api import Engine

def run(scenario, seed, months, verbose=False):
    e = Engine()
    r = e.call('new_game', {'scenario': scenario, 'seed': seed, 'limit_months': months})
    assert r['ok'], r
    steps = 0; kinds = collections.Counter(); battles = 0; captures = 0; duels = 0
    t0 = time.time()
    while True:
        r = e.call('ai_step')
        assert r['ok'], r
        if r.get('idle'):
            break
        steps += 1
        for ev in r['events']:
            kinds[ev['type']] += 1
        assert steps < 200000
    s = r['state']
    alive = [f['name'] for f in s['factions'].values() if f['alive']]
    w = s['winner'] and s['factions'][s['winner']]['name']
    print(f"{scenario} seed={seed}: {s['year']}/{s['month']} 回合{s['turn']} 步{steps} 勝者={w} 存活={alive} {time.time()-t0:.1f}s")
    print('   ', dict(kinds.most_common(14)))
    return s

if __name__ == '__main__':
    for sc, seed, m in [('s194', 1, 120), ('s194', 2, 120), ('s220', 3, 120)]:
        run(sc, seed, m)
