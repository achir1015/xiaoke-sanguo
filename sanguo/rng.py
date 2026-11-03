# -*- coding: utf-8 -*-
"""可存檔的亂數：狀態只是一個整數，存在遊戲 state['rng'] 裡，網路兩端與重播都能得到同樣結果。"""

MASK = (1 << 48) - 1


class Rng:
    def __init__(self, state):
        self.state = state

    def _next(self):
        s = self.state
        s['rng'] = (s['rng'] * 25214903917 + 11) & MASK
        return s['rng']

    def random(self):
        return (self._next() >> 16) / float(1 << 32)

    def uniform(self, a, b):
        return a + (b - a) * self.random()

    def randint(self, a, b):
        return a + int(self.random() * (b - a + 1))

    def chance(self, p):
        return self.random() < p

    def choice(self, seq):
        return seq[int(self.random() * len(seq))]

    def weighted(self, items):
        """items: [(值, 權重)]"""
        total = sum(max(0.0, w) for _, w in items)
        if total <= 0:
            return items[0][0]
        r = self.random() * total
        for v, w in items:
            r -= max(0.0, w)
            if r <= 0:
                return v
        return items[-1][0]
