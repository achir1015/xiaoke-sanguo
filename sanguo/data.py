# -*- coding: utf-8 -*-
"""遊戲資料：城市、道路、武將、勢力與劇本（原創數值，以史實人物為題材）。

座標 x 由西到東、y 由北到南，範圍 0～100；3D 地圖依這些座標擺放城池。
"""

# 城市：代號 → (名稱, x, y, 地形, 農業上限, 商業上限, 城防上限, 人口)
# 地形：plain 平原、hill 丘陵、mount 山地、water 水鄉
CITIES = {
    'beiping':  ('北平', 84, 6, 'plain', 700, 600, 900, 42000),
    'ji':       ('薊', 76, 11, 'plain', 800, 700, 900, 52000),
    'nanpi':    ('南皮', 80, 21, 'plain', 900, 700, 800, 55000),
    'pingyuan': ('平原', 73, 27, 'plain', 900, 700, 700, 50000),
    'ye':       ('鄴', 65, 25, 'plain', 1000, 1000, 1200, 80000),
    'jinyang':  ('晉陽', 55, 15, 'hill', 700, 600, 1000, 45000),
    'beihai':   ('北海', 88, 31, 'water', 800, 800, 700, 50000),
    'puyang':   ('濮陽', 71, 35, 'plain', 900, 800, 800, 52000),
    'chenliu':  ('陳留', 68, 42, 'plain', 900, 900, 800, 56000),
    'luoyang':  ('洛陽', 57, 40, 'plain', 1000, 1000, 1300, 70000),
    'changan':  ('長安', 41, 41, 'plain', 1000, 1000, 1300, 75000),
    'tianshui': ('天水', 27, 41, 'hill', 600, 500, 900, 35000),
    'wuwei':    ('武威', 15, 26, 'hill', 500, 500, 800, 30000),
    'xiaopei':  ('小沛', 78, 44, 'plain', 700, 600, 600, 40000),
    'xiapi':    ('下邳', 85, 47, 'water', 900, 900, 1000, 60000),
    'xuchang':  ('許昌', 64, 49, 'plain', 1000, 1000, 1100, 72000),
    'runan':    ('汝南', 69, 56, 'plain', 800, 700, 700, 50000),
    'shouchun': ('壽春', 79, 57, 'water', 900, 900, 1000, 60000),
    'wan':      ('宛', 57, 53, 'plain', 900, 800, 900, 55000),
    'hanzhong': ('漢中', 37, 53, 'mount', 700, 600, 1100, 45000),
    'xinye':    ('新野', 56, 60, 'plain', 600, 500, 600, 35000),
    'xiangyang': ('襄陽', 55, 66, 'water', 1000, 1000, 1200, 70000),
    'jiangling': ('江陵', 51, 74, 'water', 1000, 900, 1100, 65000),
    'jiangxia': ('江夏', 64, 71, 'water', 800, 800, 900, 50000),
    'lujiang':  ('廬江', 75, 66, 'water', 800, 700, 800, 48000),
    'jianye':   ('建業', 86, 62, 'water', 1000, 1100, 1200, 70000),
    'wu':       ('吳', 91, 70, 'water', 1000, 1000, 1000, 65000),
    'kuaiji':   ('會稽', 90, 80, 'water', 800, 800, 800, 50000),
    'chaisang': ('柴桑', 72, 76, 'water', 700, 700, 900, 42000),
    'changsha': ('長沙', 61, 83, 'plain', 900, 700, 800, 55000),
    'wuling':   ('武陵', 50, 84, 'hill', 600, 500, 700, 38000),
    'lingling': ('零陵', 54, 93, 'hill', 600, 500, 700, 36000),
    'guiyang':  ('桂陽', 65, 93, 'hill', 600, 500, 700, 36000),
    'zitong':   ('梓潼', 32, 62, 'mount', 500, 400, 1100, 30000),
    'chengdu':  ('成都', 26, 72, 'plain', 1100, 1000, 1200, 78000),
    'jiangzhou': ('江州', 37, 77, 'water', 700, 600, 900, 45000),
    'yongan':   ('永安', 44, 71, 'mount', 500, 500, 1000, 32000),
    'jianning': ('建寧', 27, 90, 'mount', 500, 400, 700, 32000),
}

# 道路（無向）：(甲, 乙, 類型) 類型 land 陸路、river 渡河、pass 關隘
ROADS = [
    ('beiping', 'ji', 'land'), ('ji', 'nanpi', 'land'), ('ji', 'jinyang', 'pass'),
    ('nanpi', 'pingyuan', 'land'), ('nanpi', 'ye', 'land'), ('nanpi', 'beihai', 'land'),
    ('pingyuan', 'ye', 'land'), ('pingyuan', 'beihai', 'land'), ('pingyuan', 'puyang', 'river'),
    ('ye', 'jinyang', 'pass'), ('ye', 'puyang', 'river'), ('ye', 'luoyang', 'river'),
    ('jinyang', 'changan', 'pass'), ('beihai', 'xiaopei', 'land'), ('beihai', 'xiapi', 'land'),
    ('puyang', 'chenliu', 'land'), ('puyang', 'xiaopei', 'land'),
    ('chenliu', 'luoyang', 'land'), ('chenliu', 'xuchang', 'land'), ('chenliu', 'xiaopei', 'land'),
    ('luoyang', 'changan', 'pass'), ('luoyang', 'xuchang', 'land'), ('luoyang', 'wan', 'pass'),
    ('changan', 'tianshui', 'land'), ('changan', 'hanzhong', 'pass'), ('changan', 'wan', 'pass'),
    ('tianshui', 'wuwei', 'land'), ('tianshui', 'hanzhong', 'pass'),
    ('xiaopei', 'xiapi', 'land'), ('xiaopei', 'runan', 'land'), ('xiapi', 'shouchun', 'land'),
    ('xiapi', 'jianye', 'river'), ('xuchang', 'runan', 'land'), ('xuchang', 'wan', 'land'),
    ('runan', 'shouchun', 'land'), ('runan', 'xinye', 'land'), ('runan', 'jiangxia', 'land'),
    ('shouchun', 'lujiang', 'land'), ('shouchun', 'jianye', 'river'),
    ('wan', 'xinye', 'land'), ('wan', 'hanzhong', 'pass'),
    ('hanzhong', 'zitong', 'pass'), ('hanzhong', 'yongan', 'pass'),
    ('xinye', 'xiangyang', 'river'), ('xiangyang', 'jiangling', 'land'), ('xiangyang', 'jiangxia', 'land'),
    ('jiangling', 'yongan', 'river'), ('jiangling', 'jiangxia', 'river'), ('jiangling', 'wuling', 'river'),
    ('jiangling', 'changsha', 'river'), ('jiangxia', 'lujiang', 'river'), ('jiangxia', 'chaisang', 'river'),
    ('jiangxia', 'changsha', 'river'), ('lujiang', 'chaisang', 'river'), ('lujiang', 'jianye', 'river'),
    ('jianye', 'wu', 'land'), ('wu', 'kuaiji', 'land'), ('chaisang', 'changsha', 'land'),
    ('chaisang', 'kuaiji', 'land'), ('changsha', 'wuling', 'land'), ('changsha', 'lingling', 'land'),
    ('changsha', 'guiyang', 'land'), ('wuling', 'lingling', 'land'), ('lingling', 'guiyang', 'land'),
    ('wuling', 'jiangzhou', 'mount'), ('zitong', 'chengdu', 'pass'), ('zitong', 'jiangzhou', 'land'),
    ('chengdu', 'jiangzhou', 'land'), ('chengdu', 'jianning', 'mount'), ('jiangzhou', 'yongan', 'river'),
    ('jiangzhou', 'jianning', 'mount'), ('wuling', 'jianning', 'mount'),
]

# 武將：名|性別|統率|武力|智力|政治|魅力|登場年|退場年|故鄉城市
OFFICER_TABLE = """
曹操|男|95|72|91|94|96|170|220|chenliu
曹丕|男|74|70|80|83|78|205|226|ye
曹仁|男|88|85|60|52|72|185|223|xuchang
曹洪|男|74|79|45|40|60|185|232|chenliu
夏侯惇|男|86|90|58|66|82|185|220|chenliu
夏侯淵|男|85|89|55|45|70|185|219|chenliu
張遼|男|92|92|77|56|80|185|222|jinyang
徐晃|男|85|89|68|50|66|190|227|luoyang
張郃|男|88|87|70|55|64|185|231|ye
于禁|男|78|76|66|54|55|185|221|puyang
樂進|男|76|84|50|42|58|185|218|puyang
典韋|男|55|96|30|25|55|185|197|chenliu
許褚|男|64|96|35|22|62|190|230|runan
郭嘉|男|60|20|97|82|78|190|207|xuchang
荀彧|男|58|25|95|98|90|185|212|xuchang
荀攸|男|64|30|94|86|70|185|214|xuchang
程昱|男|72|50|89|80|55|185|220|puyang
賈詡|男|80|40|97|85|60|185|223|wuwei
司馬懿|男|96|62|98|92|84|205|251|luoyang
李典|男|78|72|72|60|70|185|215|puyang
曹彰|男|78|92|40|30|60|205|223|ye
滿寵|男|82|60|84|80|66|190|242|chenliu
鄧艾|男|92|80|90|75|66|220|264|wan
甄姬|女|25|12|70|62|92|195|221|ye
蔡琰|女|20|10|84|72|84|195|230|chenliu
辛憲英|女|30|15|88|75|80|205|269|xuchang
王異|女|62|55|80|50|70|200|240|tianshui
袁紹|男|82|70|72|74|92|185|202|nanpi
顏良|男|78|93|40|32|60|185|200|nanpi
文醜|男|78|94|30|28|58|185|200|nanpi
田豐|男|70|30|93|85|60|185|200|pingyuan
沮授|男|80|40|91|82|72|185|200|ye
審配|男|78|60|72|70|60|185|204|ye
高覽|男|72|80|45|40|50|185|210|ye
袁譚|男|64|68|50|50|58|190|205|pingyuan
許攸|男|40|30|85|60|40|185|204|nanpi
逢紀|男|50|30|80|66|45|185|202|nanpi
公孫瓚|男|84|86|50|42|72|185|199|beiping
趙雲|男|92|96|76|65|85|190|229|ji
田楷|男|62|60|45|48|50|185|199|beiping
嚴綱|男|60|64|40|38|40|185|199|beiping
袁術|男|62|60|62|54|62|185|199|runan
紀靈|男|76|86|40|36|48|185|199|shouchun
張勳|男|62|62|46|40|42|185|199|shouchun
楊弘|男|40|20|72|70|50|185|199|shouchun
閻象|男|35|20|74|72|56|185|199|runan
呂布|男|86|100|26|12|40|185|198|wuwei
陳宮|男|80|56|90|78|66|185|198|puyang
高順|男|86|86|50|40|60|185|198|puyang
臧霸|男|76|80|56|52|66|185|228|xiapi
貂蟬|女|30|20|80|70|98|185|220|luoyang
孫策|男|90|93|70|65|92|190|200|wu
孫權|男|82|66|82|85|95|190|252|wu
周瑜|男|96|72|96|85|93|190|210|lujiang
魯肅|男|82|54|92|88|88|190|217|xiapi
呂蒙|男|90|82|90|74|76|195|219|runan
陸遜|男|95|66|95|88|86|205|245|wu
甘寧|男|86|93|70|40|70|195|220|jiangzhou
太史慈|男|84|93|68|50|78|185|206|beihai
黃蓋|男|80|82|70|60|72|185|215|lingling
程普|男|82|77|70|66|76|185|210|beiping
韓當|男|76|80|54|50|62|185|227|beiping
周泰|男|76|91|50|40|60|190|225|shouchun
凌統|男|74|87|50|45|65|205|237|wu
張昭|男|30|20|85|94|80|185|236|xiapi
諸葛瑾|男|66|40|82|84|88|195|241|jianye
丁奉|男|80|83|70|52|64|210|271|lujiang
孫尚香|女|70|82|60|40|80|200|230|wu
大喬|女|20|10|66|60|92|195|230|lujiang
小喬|女|25|15|72|62|92|195|230|lujiang
劉備|男|84|76|76|80|99|185|223|ji
關羽|男|96|98|76|64|94|185|219|jinyang
張飛|男|86|98|35|25|48|185|221|ji
諸葛亮|男|98|40|100|96|94|205|234|xiangyang
龐統|男|82|36|97|85|70|205|214|xiangyang
黃忠|男|86|93|62|52|72|190|220|changsha
馬超|男|88|97|46|30|82|190|222|wuwei
魏延|男|86|92|68|48|52|200|234|wan
法正|男|74|46|95|80|50|190|220|changan
徐庶|男|76|66|93|82|82|195|234|xuchang
簡雍|男|30|30|70|72|80|185|215|ji
孫乾|男|34|30|72|74|80|185|215|beihai
糜竺|男|30|25|66|82|84|185|221|xiapi
關平|男|72|82|62|50|70|200|219|jinyang
姜維|男|92|89|90|70|78|220|264|tianshui
馬謖|男|62|60|84|70|60|210|228|xiangyang
黃月英|女|50|30|92|80|80|200|240|xiangyang
劉表|男|66|40|72|84|86|185|208|xiangyang
蔡瑁|男|74|62|66|60|40|185|208|xiangyang
蒯越|男|50|30|86|80|66|185|214|xiangyang
黃祖|男|70|70|50|46|40|185|208|jiangxia
文聘|男|82|80|66|58|70|190|226|wan
劉璋|男|40|30|50|60|70|190|219|chengdu
嚴顏|男|80|82|66|60|74|185|220|jiangzhou
張任|男|84|84|72|50|70|190|214|chengdu
黃權|男|72|50|84|80|74|190|240|jiangzhou
李嚴|男|80|80|72|76|62|190|234|wan
吳懿|男|70|70|60|60|60|190|237|chenliu
張松|男|20|20|84|80|30|190|212|chengdu
馬騰|男|80|86|50|50|82|185|212|wuwei
韓遂|男|78|72|72|60|60|185|215|wuwei
馬岱|男|76|82|52|46|62|190|235|wuwei
龐德|男|82|94|60|40|70|190|219|tianshui
張魯|男|60|40|72|82|80|185|216|hanzhong
閻圃|男|50|30|80|76|66|185|220|hanzhong
張衛|男|66|70|30|30|40|185|215|hanzhong
楊任|男|66|72|40|36|42|185|215|hanzhong
李傕|男|70|76|30|20|20|185|198|wuwei
郭汜|男|66|74|25|18|18|185|197|wuwei
張繡|男|76|82|58|46|64|190|207|wuwei
孔融|男|30|20|76|74|86|185|208|beihai
王朗|男|50|30|74|80|70|185|228|kuaiji
劉繇|男|50|40|50|58|62|185|197|beihai
華歆|男|40|20|80|86|66|185|231|pingyuan
鍾繇|男|60|30|80|90|72|185|230|xuchang
王平|男|80|76|72|56|60|210|248|hanzhong
廖化|男|72|76|62|50|62|195|264|xiangyang
周倉|男|60|86|30|20|50|190|219|jinyang
陳到|男|80|84|60|46|60|190|230|runan
步騭|男|70|50|80|82|72|200|247|xiapi
徐盛|男|82|84|72|50|64|200|228|lujiang
朱桓|男|82|84|68|50|60|205|238|wu
"""


def _parse_officers():
    out = []
    for line in OFFICER_TABLE.strip().splitlines():
        p = line.split('|')
        out.append({
            'name': p[0], 'female': p[1] == '女',
            'lead': int(p[2]), 'war': int(p[3]), 'int': int(p[4]), 'pol': int(p[5]), 'cha': int(p[6]),
            'from': int(p[7]), 'to': int(p[8]), 'home': p[9],
        })
    for i, o in enumerate(out):
        o['id'] = 'o%03d' % (i + 1)
    return out


OFFICERS = _parse_officers()
OFFICER_BY_NAME = {o['name']: o for o in OFFICERS}

# 勢力顏色（3D 旗幟與地圖）
COLORS = ['#2f5fb3', '#2f9a4a', '#c0392b', '#c9a227', '#7b3fa0', '#1f8a8a', '#a0622a',
          '#d07a2a', '#6b7280', '#e5e7eb', '#8b1e3f', '#4b5563']

# 劇本：factions 每個勢力 {key, name, ruler, color, cities: {城: [武將...]}}；第一座城為首都
SCENARIOS = {
    's194': {
        'name': '群雄割據', 'year': 194, 'month': 1,
        'desc': '西元 194 年，董卓已死，天下群雄並起。曹操據兗豫、呂布襲濮陽、劉備新領徐州，江東小霸王孫策蓄勢待發。',
        'factions': [
            {'key': 'cao', 'name': '曹操', 'ruler': '曹操', 'color': 0, 'cities': {
                'chenliu': ['曹操', '夏侯惇', '典韋', '荀彧', '郭嘉'], 'xuchang': ['曹仁', '于禁', '程昱', '李典'],
                'wan': ['夏侯淵', '樂進', '荀攸', '滿寵']}},
            {'key': 'liu', 'name': '劉備', 'ruler': '劉備', 'color': 1, 'cities': {
                'xiapi': ['劉備', '關羽', '張飛', '糜竺', '孫乾'], 'xiaopei': ['簡雍', '陳到', '周倉']}},
            {'key': 'sun', 'name': '孫策', 'ruler': '孫策', 'color': 2, 'cities': {
                'wu': ['孫策', '周瑜', '程普', '黃蓋', '張昭'], 'kuaiji': ['韓當', '周泰', '孫權']}},
            {'key': 'yuan', 'name': '袁紹', 'ruler': '袁紹', 'color': 3, 'cities': {
                'ye': ['袁紹', '沮授', '審配', '張郃'], 'nanpi': ['顏良', '文醜', '許攸', '逢紀'],
                'pingyuan': ['田豐', '袁譚', '華歆'], 'jinyang': ['高覽']}},
            {'key': 'lvbu', 'name': '呂布', 'ruler': '呂布', 'color': 4, 'cities': {
                'puyang': ['呂布', '陳宮', '高順', '張遼', '貂蟬', '臧霸']}},
            {'key': 'liubiao', 'name': '劉表', 'ruler': '劉表', 'color': 5, 'cities': {
                'xiangyang': ['劉表', '蔡瑁', '蒯越'], 'jiangxia': ['黃祖'], 'jiangling': ['文聘'],
                'changsha': ['黃忠'], 'wuling': [], 'lingling': [], 'guiyang': [], 'xinye': []}},
            {'key': 'liuzhang', 'name': '劉璋', 'ruler': '劉璋', 'color': 6, 'cities': {
                'chengdu': ['劉璋', '張任', '張松', '法正'], 'jiangzhou': ['嚴顏', '黃權'], 'zitong': ['吳懿'],
                'yongan': ['李嚴'], 'jianning': []}},
            {'key': 'mateng', 'name': '馬騰', 'ruler': '馬騰', 'color': 7, 'cities': {
                'wuwei': ['馬騰', '馬超', '馬岱'], 'tianshui': ['韓遂', '龐德']}},
            {'key': 'zhanglu', 'name': '張魯', 'ruler': '張魯', 'color': 8, 'cities': {
                'hanzhong': ['張魯', '閻圃', '張衛', '楊任']}},
            {'key': 'gongsun', 'name': '公孫瓚', 'ruler': '公孫瓚', 'color': 9, 'cities': {
                'beiping': ['公孫瓚', '趙雲', '田楷'], 'ji': ['嚴綱']}},
            {'key': 'yuanshu', 'name': '袁術', 'ruler': '袁術', 'color': 10, 'cities': {
                'shouchun': ['袁術', '紀靈', '張勳', '楊弘'], 'runan': ['閻象'], 'lujiang': []}},
            {'key': 'lijue', 'name': '李傕', 'ruler': '李傕', 'color': 11, 'cities': {
                'changan': ['李傕', '郭汜', '賈詡', '張繡']}},
        ],
    },
    's220': {
        'name': '三分天下', 'year': 220, 'month': 1,
        'desc': '西元 220 年，曹丕代漢稱帝，劉備據益州漢中，孫權雄踞江東荊州。魏蜀吳三國鼎立，誰能一統天下？',
        'factions': [
            {'key': 'wei', 'name': '魏', 'ruler': '曹丕', 'color': 0, 'cities': {
                'luoyang': ['曹丕', '司馬懿', '賈詡', '辛憲英'], 'xuchang': ['曹仁', '滿寵', '鍾繇'],
                'ye': ['曹彰', '甄姬', '華歆'], 'changan': ['張郃', '曹洪'],
                'tianshui': ['王異'], 'wan': ['徐晃', '鄧艾'], 'xiangyang': ['文聘'], 'shouchun': ['張遼', '臧霸'],
                'chenliu': [], 'puyang': [], 'pingyuan': [], 'nanpi': [], 'ji': [], 'beiping': [],
                'jinyang': [], 'beihai': [], 'xiaopei': [], 'xiapi': [], 'runan': [], 'wuwei': [], 'xinye': []}},
            {'key': 'shu', 'name': '蜀', 'ruler': '劉備', 'color': 1, 'cities': {
                'chengdu': ['劉備', '諸葛亮', '黃月英', '黃權'], 'hanzhong': ['魏延', '王平', '吳懿'],
                'zitong': ['馬超', '馬岱'], 'jiangzhou': ['趙雲', '李嚴', '馬謖'], 'yongan': ['張飛', '陳到', '廖化'],
                'jianning': []}},
            {'key': 'wuk', 'name': '吳', 'ruler': '孫權', 'color': 2, 'cities': {
                'jianye': ['孫權', '張昭', '諸葛瑾', '孫尚香'], 'jiangling': ['陸遜', '朱桓'], 'jiangxia': ['周泰', '凌統'],
                'lujiang': ['徐盛', '丁奉'], 'wu': ['步騭', '大喬', '小喬'], 'kuaiji': [], 'chaisang': ['韓當'],
                'changsha': [], 'wuling': [], 'lingling': [], 'guiyang': []}},
        ],
    },
}

# 30 位 AI 軍師（玩家的陪同軍師，與遊戲中武將分開）：代號、名字、性別、風格、口頭禪
# 風格：attack 進攻、defend 守成、economy 內政、scheme 謀略、balance 均衡
ADVISORS = [
    ('adv01', '諸葛亮', '男', 'balance', '臥龍', '亮以為'),
    ('adv02', '司馬懿', '男', 'defend', '冢虎', '懿以為'),
    ('adv03', '郭嘉', '男', 'attack', '鬼才', '嘉以為'),
    ('adv04', '周瑜', '男', 'attack', '美周郎', '瑜以為'),
    ('adv05', '龐統', '男', 'scheme', '鳳雛', '統以為'),
    ('adv06', '荀彧', '男', 'economy', '王佐之才', '彧以為'),
    ('adv07', '賈詡', '男', 'scheme', '毒士', '詡以為'),
    ('adv08', '魯肅', '男', 'economy', '子敬', '肅以為'),
    ('adv09', '陸遜', '男', 'defend', '儒將', '遜以為'),
    ('adv10', '徐庶', '男', 'balance', '元直', '庶以為'),
    ('adv11', '荀攸', '男', 'scheme', '謀主', '攸以為'),
    ('adv12', '法正', '男', 'attack', '孝直', '正以為'),
    ('adv13', '陳宮', '男', 'scheme', '公台', '宮以為'),
    ('adv14', '田豐', '男', 'defend', '元皓', '豐以為'),
    ('adv15', '沮授', '男', 'balance', '監軍', '授以為'),
    ('adv16', '程昱', '男', 'attack', '仲德', '昱以為'),
    ('adv17', '張昭', '男', 'economy', '子布', '昭以為'),
    ('adv18', '呂蒙', '男', 'attack', '白衣渡江', '蒙以為'),
    ('adv19', '姜維', '男', 'attack', '麒麟兒', '維以為'),
    ('adv20', '鄧艾', '男', 'scheme', '奇兵', '艾以為'),
    ('adv21', '黃月英', '女', 'economy', '巧思', '妾身以為'),
    ('adv22', '蔡文姬', '女', 'balance', '才女', '文姬以為'),
    ('adv23', '辛憲英', '女', 'defend', '明鑑', '憲英以為'),
    ('adv24', '王異', '女', 'attack', '烈女', '異以為'),
    ('adv25', '貂蟬', '女', 'scheme', '閉月', '貂蟬以為'),
    ('adv26', '大喬', '女', 'economy', '國色', '大喬以為'),
    ('adv27', '小喬', '女', 'balance', '江東雙璧', '小喬以為'),
    ('adv28', '孫尚香', '女', 'attack', '弓腰姬', '尚香以為'),
    ('adv29', '甄宓', '女', 'defend', '洛神', '甄宓以為'),
    ('adv30', '鮑三娘', '女', 'attack', '巾幗', '三娘以為'),
]

STYLE_NAMES = {'attack': '進攻', 'defend': '守成', 'economy': '內政', 'scheme': '謀略', 'balance': '均衡'}

# 20 位男性、20 位女性玩家頭像（原創人物）
PLAYER_PORTRAITS = (
    [('m%02d' % (i + 1), n, '男') for i, n in enumerate(
        ['青鋒少將', '赤膽將軍', '白袍銀槍', '鐵甲虎賁', '玄甲騎都', '儒雅書生', '飛羽神射', '西涼猛士', '江東水師', '北地遊俠',
         '紫金太守', '雲中郎將', '刀筆文吏', '長髯老將', '虎頭力士', '布衣軍師', '黑面莽夫', '翩翩公子', '巴蜀勇士', '關外刀客'])]
    + [('f%02d' % (i + 1), n, '女') for i, n in enumerate(
        ['紅纓女將', '月下琴師', '江南才女', '巾幗統帥', '飛燕弓手', '洛水仙子', '錦衣郡主', '劍舞佳人', '山中隱士', '百花夫人',
         '紫衣謀士', '銀甲先鋒', '雪原騎手', '翠竹書香', '鳳冠皇后', '蜀錦繡娘', '雙刀俠女', '鼓樂將軍', '素衣醫者', '海濱漁女'])]
)
