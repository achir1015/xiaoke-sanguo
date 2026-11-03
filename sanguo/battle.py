# -*- coding: utf-8 -*-
"""戰鬥：每回合雙方各選一種戰術，依相剋關係與武將能力計算傷亡。

相剋：突擊 → 計策 → 固守 → 突擊（箭頭指向被剋的一方）；齊射穩定、剋固守但怕突擊。
單挑：主將一對一，勝方士氣大振；被拒絕時拒絕方士氣下滑。撤退：只有進攻方可以撤退。
"""

TACTICS = ['突擊', '齊射', '固守', '計策', '單挑', '撤退']
BASIC = ['突擊', '齊射', '固守', '計策']

# 甲戰術對乙戰術造成傷害的倍率
DEALT = {
    '突擊': {'突擊': 1.0, '齊射': 1.5, '固守': 0.6, '計策': 1.4},
    '齊射': {'突擊': 0.7, '齊射': 0.9, '固守': 1.5, '計策': 1.0},
    '固守': {'突擊': 1.2, '齊射': 0.4, '固守': 0.25, '計策': 0.4},
    '計策': {'突擊': 0.6, '齊射': 1.0, '固守': 1.8, '計策': 0.8},
}
TAKEN = {'突擊': 1.1, '齊射': 1.0, '固守': 0.7, '計策': 1.0}
WALL_HIT = {'突擊': 0.08, '齊射': 0.04, '固守': 0.0, '計策': 0.10}

TACTIC_TIPS = {
    '突擊': '全軍衝鋒：剋制齊射與計策，但撞上固守會吃虧',
    '齊射': '弓弩齊發：穩定輸出，剋制固守，怕對方突擊',
    '固守': '結陣固守：受到傷害大減，反擊衝鋒的敵人，但怕計策火攻',
    '計策': '火計與伏兵：看智力高低決定成敗，剋制固守，怕突擊',
    '單挑': '主將出陣一對一：勝者全軍士氣大振',
    '撤退': '保留兵力撤回原城（只有進攻方可以撤退）',
}

MAX_ROUNDS = 10


def side_stats(game, side):
    """一方軍隊的能力：各項取軍中最高者（多帶武將有加成）。"""
    offs = [game.officer(o) for o in side['officers']]
    if not offs:
        return {'lead': 45, 'war': 45, 'int': 40, 'names': ['守城士卒']}
    return {
        'lead': max(o['lead'] for o in offs),
        'war': max(o['war'] for o in offs),
        'int': max(o['int'] for o in offs),
        'names': [o['name'] for o in offs],
    }


def duelist(game, side):
    """出戰單挑的武將：武力最高且還沒單挑過的人。"""
    offs = [game.officer(o) for o in side['officers'] if o not in side.get('dueled', [])]
    if not offs:
        return None
    return max(offs, key=lambda o: o['war'])


def can_duel(game, side):
    d = duelist(game, side)
    return d is not None and d['war'] >= 55


def options(game, b, role):
    """這一方可選的戰術。"""
    side = b[role]
    out = list(BASIC)
    if can_duel(game, side) and can_duel(game, b['def' if role == 'att' else 'att']):
        out.append('單挑')
    if role == 'att':
        out.append('撤退')
    return out


def power(stats, side, tactic):
    if tactic == '突擊':
        f = stats['lead'] * 0.5 + stats['war'] * 0.5
    elif tactic == '齊射':
        f = stats['lead'] * 0.7 + stats['war'] * 0.3
    elif tactic == '固守':
        f = stats['lead']
    else:
        f = stats['int']
    return (f / 70.0) * (0.6 + side['training'] / 250.0) * (0.6 + side['morale'] / 250.0)


def wall_factor(b, role):
    """守城方受到的傷害依城防減少。"""
    if role == 'def' and b['city_def']:
        d = b['wall']
        return 1.0 - d / (d + 1500.0)
    return 1.0


def scheme_success(game, b, role):
    me = side_stats(game, b[role])
    op = side_stats(game, b['def' if role == 'att' else 'att'])
    return max(0.2, min(0.92, 0.55 + (me['int'] - op['int']) / 90.0))


def resolve_round(game, b):
    """雙方都選好戰術後結算一回合，回傳事件列表。"""
    rng = game.rng
    ev = []
    ta, td = b['choice']['att'], b['choice']['def']
    b['round'] += 1
    rnd = {'type': 'battle_round', 'round': b['round'], 'att_tactic': ta, 'def_tactic': td}
    A, D = b['att'], b['def']

    if ta == '撤退':
        b['result'] = 'retreat'
        rnd['text'] = f"第 {b['round']} 回合：進攻方撤退。"
        ev.append(rnd)
        return ev

    if ta == '單挑' or td == '單挑':
        challenger = 'att' if ta == '單挑' else 'def'
        other = 'def' if challenger == 'att' else 'att'
        ch = duelist(game, b[challenger])
        op = duelist(game, b[other])
        both = ta == '單挑' and td == '單挑'
        accept = both or (op is not None and (op['war'] >= ch['war'] - 8 or rng.chance(0.3)))
        if op is None:
            accept = False
        if accept:
            ev.append(rnd)
            ev.extend(duel(game, b, challenger, ch, op))
            b['choice'] = {'att': None, 'def': None}
            check_end(b)
            return ev
        # 拒絕單挑：拒絕方士氣下滑，邀戰方士氣上升，拒絕方的戰術打折
        b[other]['morale'] = max(0, b[other]['morale'] - 20)
        b[challenger]['morale'] = min(100, b[challenger]['morale'] + 5)
        rnd['refused'] = True
        rnd['text'] = f"{ch['name']} 出陣邀戰，{op['name'] if op else '敵軍'} 不敢應戰，士氣大跌！"
        if challenger == 'att':
            ta = '固守'
            rnd['att_tactic'] = '單挑'
        else:
            td = '固守'
            rnd['def_tactic'] = '單挑'

    sa, sd = side_stats(game, A), side_stats(game, D)
    dmg = {}
    for role, mine, theirs, st in (('att', ta, td, sa), ('def', td, ta, sd)):
        mult = DEALT[mine][theirs]
        if mine == '計策':
            ok = rng.chance(scheme_success(game, b, role))
            rnd[role + '_scheme'] = ok
            if not ok:
                mult = 0.2
                b[role]['morale'] = max(0, b[role]['morale'] - 4)
        if rnd.get('refused') and ((role == 'att') != (rnd['att_tactic'] == '單挑')):
            mult *= 0.5   # 拒絕單挑的一方軍心動搖
        target = 'def' if role == 'att' else 'att'
        raw = b[role]['soldiers'] * 0.15 * power(st, b[role], mine) * mult * rng.uniform(0.85, 1.15)
        raw *= TAKEN[theirs] * wall_factor(b, target)
        dmg[target] = int(min(b[target]['soldiers'], max(0, raw)))
        if role == 'att' and b['city_def'] and mine in WALL_HIT:
            hit = int(raw * WALL_HIT[mine] * (1.5 if mine == '計策' and rnd.get('att_scheme') else 1.0))
            b['wall'] = max(0, b['wall'] - hit)
            rnd['wall_hit'] = hit
    for role in ('att', 'def'):
        before = max(1, b[role]['soldiers'])
        b[role]['soldiers'] -= dmg[role]
        b[role]['morale'] = max(0, b[role]['morale'] - int(dmg[role] / before * 110))
    # 相剋勝方士氣小升
    if DEALT[ta][td] > DEALT[td][ta]:
        A['morale'] = min(100, A['morale'] + 3)
    elif DEALT[td][ta] > DEALT[ta][td]:
        D['morale'] = min(100, D['morale'] + 3)
    b.setdefault('history', []).append({'att': rnd['att_tactic'], 'def': rnd['def_tactic']})
    rnd.update({'att_loss': dmg['att'], 'def_loss': dmg['def'], 'att_soldiers': A['soldiers'], 'def_soldiers': D['soldiers'],
                'att_morale': A['morale'], 'def_morale': D['morale'], 'wall': b['wall']})
    if 'text' not in rnd:
        rnd['text'] = f"第 {b['round']} 回合：攻方{ta}、守方{td}，攻方損失 {dmg['att']}，守方損失 {dmg['def']}。"
    else:
        rnd['text'] += f" 攻方損失 {dmg['att']}，守方損失 {dmg['def']}。"
    ev.append(rnd)
    b['choice'] = {'att': None, 'def': None}
    check_end(b)
    return ev


def duel(game, b, challenger, ch, op):
    rng = game.rng
    other = 'def' if challenger == 'att' else 'att'
    b[challenger].setdefault('dueled', []).append(ch['id'])
    b[other].setdefault('dueled', []).append(op['id'])
    hp = {ch['id']: 100, op['id']: 100}
    bouts = []
    wa, wb = ch['war'] ** 3, op['war'] ** 3
    for i in range(6):
        a_hits = rng.chance(wa / (wa + wb))
        hitter, victim = (ch, op) if a_hits else (op, ch)
        d = rng.randint(14, 30) + max(0, (hitter['war'] - victim['war']) // 3)
        hp[victim['id']] = max(0, hp[victim['id']] - d)
        bouts.append({'hitter': hitter['id'], 'victim': victim['id'], 'dmg': d, 'hp': dict(hp)})
        if hp[victim['id']] <= 0:
            break
    if abs(hp[ch['id']] - hp[op['id']]) < 12 and min(hp.values()) > 0:
        winner = None
    else:
        winner = ch if hp[ch['id']] > hp[op['id']] else op
    ev = {'type': 'duel', 'a': ch['id'], 'b': op['id'], 'a_side': challenger, 'bouts': bouts, 'winner': winner['id'] if winner else None}
    if winner is None:
        ev['text'] = f"{ch['name']} 與 {op['name']} 大戰數十回合，不分勝負！"
    else:
        loser = op if winner is ch else ch
        wside = challenger if winner is ch else other
        lside = other if wside == challenger else challenger
        b[wside]['morale'] = min(100, b[wside]['morale'] + 15)
        b[lside]['morale'] = max(0, b[lside]['morale'] - 30)
        ev['text'] = f"單挑：{winner['name']} 擊敗了 {loser['name']}！"
        if hp[loser['id']] <= 0:
            fate = rng.random()
            if fate < 0.10 and not game.is_ruler(loser['id']):
                ev['fate'] = 'killed'
                ev['text'] += f" {loser['name']} 戰死沙場。"
                game.kill_officer(loser['id'], in_battle=b)
            elif fate < 0.35:
                ev['fate'] = 'captured'
                ev['text'] += f" {loser['name']} 被生擒。"
                b[lside]['officers'] = [o for o in b[lside]['officers'] if o != loser['id']]
                b.setdefault('captured', []).append({'id': loser['id'], 'by': wside})
            else:
                ev['fate'] = 'wounded'
                ev['text'] += f" {loser['name']} 負傷敗退。"
    ev['att_morale'] = b['att']['morale']
    ev['def_morale'] = b['def']['morale']
    return [ev]


def check_end(b):
    if b.get('result'):
        return
    A, D = b['att'], b['def']
    if A['soldiers'] <= 0 or A['morale'] <= 5:
        b['result'] = 'def_win'
    elif D['soldiers'] <= 0 or D['morale'] <= 5:
        b['result'] = 'att_win'
    elif b['round'] >= MAX_ROUNDS:
        b['result'] = 'timeout'


# ---------------- AI 選戰術 ----------------
def ai_tactic(game, b, role, level='normal'):
    rng = game.rng
    me, op_role = b[role], ('def' if role == 'att' else 'att')
    op = b[op_role]
    sm, so = side_stats(game, me), side_stats(game, op)
    opts = options(game, b, role)
    # 撤退：進攻方兵力或士氣懸殊時
    if role == 'att' and (me['soldiers'] < op['soldiers'] * 0.35 or me['morale'] < 22) and b['round'] >= 1:
        return '撤退'
    # 單挑：武力明顯佔優
    if '單挑' in opts:
        dm, do = duelist(game, me), duelist(game, op)
        if dm and do and dm['war'] - do['war'] >= 8 and rng.chance(0.55):
            return '單挑'
    scores = tactic_scores(game, b, role)
    temp = {'easy': 0.6, 'normal': 0.35, 'hard': 0.15}.get(level, 0.35)
    best = scores[0][1]
    span = max(1.0, abs(best) + 1.0)
    weights = [(t, pow(2.718, (v - best) / (span * temp))) for t, v in scores]
    return rng.weighted(weights)


def tactic_scores(game, b, role):
    """各基本戰術的期望得失（造成傷害－承受傷害），由好到壞排序。"""
    me, op_role = b[role], ('def' if role == 'att' else 'att')
    op = b[op_role]
    sm, so = side_stats(game, me), side_stats(game, op)
    # 推測對方的戰術分佈
    guess = {'突擊': 0.3, '齊射': 0.25, '固守': 0.25, '計策': 0.2}
    if so['int'] >= 80:
        guess['計策'] += 0.15
    if so['war'] >= 85:
        guess['突擊'] += 0.12
    if op_role == 'def' and b['city_def']:
        guess['固守'] += 0.12
    for h in b.get('history', [])[-3:]:
        t = h.get(op_role)
        if t in guess:
            guess[t] += 0.08
    tot = sum(guess.values())
    scores = []
    for t in BASIC:
        val = 0.0
        for u, p in guess.items():
            dealt = me['soldiers'] * power(sm, me, t) * DEALT[t][u] * TAKEN[u] * wall_factor(b, op_role)
            if t == '計策':
                dealt *= scheme_success(game, b, role) + (1 - scheme_success(game, b, role)) * 0.2
            taken = op['soldiers'] * power(so, op, u) * DEALT[u][t] * TAKEN[t] * wall_factor(b, role)
            if u == '計策':
                taken *= scheme_success(game, b, op_role) + (1 - scheme_success(game, b, op_role)) * 0.2
            val += p / tot * (dealt - taken * 1.05)
        scores.append((t, val))
    scores.sort(key=lambda x: -x[1])
    return scores
