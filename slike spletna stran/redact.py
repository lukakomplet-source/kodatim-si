from PIL import Image, ImageDraw

SRC = "C:/Users/lukak/Documents/AI AGENCIJA WEB/kodatim-si/slike spletna stran"
DST = "C:/Users/lukak/Documents/AI AGENCIJA WEB/kodatim-si/public/reference/escortops"

BLACK = (8, 8, 12)


def redact(filename, boxes, out_name):
    im = Image.open(f"{SRC}/{filename}").convert("RGB")
    draw = ImageDraw.Draw(im)
    for box in boxes:
        draw.rectangle(box, fill=BLACK)
    im.save(f"{DST}/{out_name}", "PNG")
    print("saved", out_name, im.size)


# 1) dashboard.png — task rows 2-5 contain real partner company names + addresses
redact(
    "image-1785021527209.webp",
    boxes=[
        (238, 468, 1845, 547),   # row 2 (TOPSPEED)
        (238, 556, 1845, 635),   # row 3 (Morrisson Express Corp.)
        (238, 646, 1845, 725),   # row 4 (TOPSPEED)
        (238, 734, 1845, 813),   # row 5 (Morrisson Express Corp.)
    ],
    out_name="dashboard.png",
)

# 2) racuni.png — driver names appear in cards, leaderboard, widget title, per-agent list
redact(
    "image-1785021576857.webp",
    boxes=[
        (625, 258, 900, 283),    # card 1 name (Janos Brodej)
        (625, 434, 900, 460),    # card 2 name (Ales Padeznik)
        (625, 596, 900, 621),    # card 3 name (Samo Jelacic)
        (625, 772, 900, 798),    # card 4 name (Tamara Koren)
        (625, 932, 900, 958),    # card 5 name (Tamara Koren, partial)
        (1293, 368, 1497, 452),  # top agents leaderboard names
        (1278, 478, 1575, 548),  # "ZASLUZEK - <ime>" widget
        (1278, 585, 1420, 606),  # per-agent heading 1
        (1278, 684, 1420, 705),  # per-agent heading 2
        (1278, 784, 1420, 805),  # per-agent heading 3
        (1278, 883, 1420, 904),  # per-agent heading 4
    ],
    out_name="racuni.png",
)

# 3) ai-izracun.png — generic demo cities only, no client data, no redaction needed
redact("image-1785021581179.webp", boxes=[], out_name="ai-izracun.png")

# 4) klepet.png — sidebar list of real individual contact names
redact(
    "image-1785021590511.webp",
    boxes=[
        (199, 0, 398, 952),  # full contact-name sidebar column
    ],
    out_name="klepet.png",
)
