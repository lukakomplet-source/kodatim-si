"""
Orodja za render, ki niso modeli: OpenCV, numpy, ffmpeg.

Teče v ComfyUI-jevem vgrajenem Pythonu (D:\\kodatim-render\\ComfyUI_windows_portable
\\python_embeded) — isti numpy in torch, brez drugega okolja. Klicatelj je
worker-render/render.ts; komunikacija gre prek stdout:

    NAPREDEK <0-100>     napredek trenutnega koraka
    IZID {json}          ena vrstica z izidom, na koncu

Vse ostalo na stdout gre v dnevnik delavca.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont, ImageOps

FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
PISAVA = r"C:\Windows\Fonts\arialbd.ttf"


def napredek(p: float) -> None:
    print(f"NAPREDEK {max(0, min(100, int(p)))}", flush=True)


def izid(podatki: dict) -> None:
    print("IZID " + json.dumps(podatki, ensure_ascii=False), flush=True)


def beri_sliko(pot: str) -> np.ndarray:
    """BGR uint8. Prek PIL, ker cv2.imread ne zna poti s šumniki na Windows in
    ne upošteva EXIF zasuka (telefon shrani pokončno sliko ležeče + oznako)."""
    with Image.open(pot) as s:
        s = ImageOps.exif_transpose(s)
        if s.mode in ("I;16", "I;16B", "I"):
            s = Image.fromarray((np.asarray(s, dtype=np.float32) / 256).clip(0, 255).astype(np.uint8))
        s = s.convert("RGB")
        return cv2.cvtColor(np.asarray(s), cv2.COLOR_RGB2BGR)


def pisi_sliko(pot: str, bgr: np.ndarray, kakovost: int = 95) -> None:
    Path(pot).parent.mkdir(parents=True, exist_ok=True)
    slika = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    if pot.lower().endswith((".jpg", ".jpeg")):
        slika.save(pot, quality=kakovost, subsampling=0)
    else:
        slika.save(pot)


def sode(n: int) -> int:
    return n - (n % 2)


# --- info ---------------------------------------------------------------------


def ukaz_info(a) -> None:
    with Image.open(a.vhod) as s:
        s = ImageOps.exif_transpose(s)
        izid({"sirina": s.width, "visina": s.height, "nacin": s.mode})


# --- praske -------------------------------------------------------------------


BOPBTL = Path(os.environ.get("RENDER_MAPA", r"D:\kodatim-render")) / "orodja"
_detektor = None


def detektor_prask():
    """
    Detektor prask iz Microsoftovega „Bringing Old Photos Back to Life“ (MIT),
    uradne uteži iz izdaje v1.0 (FT_Epoch_latest.pt).

    Namesto klasičnega iskanja odklonov od mediane: 24. 9. 2026 je ta na
    razglednici 583 px za „prasko“ razglasil 6 % slike — okenske okvirje,
    ljudi, robove streh. Tanka temna črta na svetli steni je za filter enaka
    lasu na fotografiji; naučen model ju loči.
    """
    global _detektor
    if _detektor is not None:
        return _detektor
    import types
    import torch

    sys.path.insert(0, str(BOPBTL / "bopbtl" / "Global"))
    # networks.py uvaža podmodul sync_batchnorm (git submodule, ki ga v
    # izdaji ni). Pri enem GPU ga ne rabi: `self = DataParallelWithCallback(self)`
    # v __init__ ne spremeni vrnjenega modela, zato zadošča prazen modul.
    ovojnica = types.ModuleType("detection_models.sync_batchnorm")
    ovojnica.DataParallelWithCallback = None
    sys.modules["detection_models.sync_batchnorm"] = ovojnica
    from detection_models import networks

    model = networks.UNet(in_channels=1, out_channels=1, depth=4, conv_num=2, wf=6, padding=True,
                          batch_norm=True, up_mode="upsample", with_tanh=False, sync_bn=False, antialiasing=True)
    utezi = torch.load(str(BOPBTL / "bopbtl-modeli" / "FT_Epoch_latest.pt"), map_location="cpu", weights_only=True)
    model.load_state_dict(utezi["model_state"])
    naprava = "cuda" if torch.cuda.is_available() else "cpu"
    _detektor = (model.to(naprava).eval(), naprava)
    return _detektor


def maska_pri(slika: np.ndarray, najvec: int) -> np.ndarray:
    """Maska prask (verjetnost >= 0,4, prag iz izvirne kode) pri dani daljši
    stranici, vrnjena v polni ločljivosti."""
    global _detektor
    import torch
    import torch.nn.functional as F

    model, naprava = detektor_prask()
    visina, sirina = slika.shape[:2]
    # Model dela na sivini; dolžini morata biti deljivi s 16 (štirje nivoji).
    f = min(1.0, najvec / max(visina, sirina))
    v16, s16 = max(16, int(round(visina * f / 16)) * 16), max(16, int(round(sirina * f / 16)) * 16)
    siva = cv2.cvtColor(cv2.resize(slika, (s16, v16), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
    t = torch.from_numpy(siva).float().div(255).sub(0.5).div(0.5)[None, None]
    try:
        with torch.inference_mode():
            p = torch.sigmoid(model(t.to(naprava)))
    except torch.OutOfMemoryError:
        # Grafična je polna (npr. Ollama ni sprostila modela): počasneje na CPU
        # je bolje kot nič.
        torch.cuda.empty_cache()
        model = model.cpu()
        _detektor = (model, "cpu")
        with torch.inference_mode():
            p = torch.sigmoid(model(t))
    p = F.interpolate(p.cpu(), size=(visina, sirina), mode="bilinear", align_corners=False)
    return ((p[0, 0] >= 0.4).numpy().astype(np.uint8)) * 255


def maska_prask(slika: np.ndarray) -> np.ndarray:
    """
    Praska je samo tisto, kar model najde pri DVEH ločljivostih.

    Izmerjeno 24. 9. 2026 na dveh razglednicah brez prask: pri naravni
    ločljivosti modela (krajša stranica 256, kot v izvirni kodi) je kot prasko
    označil venec zvonika, pri 1024 px strešni rob cerkve — vsakič pravo
    stavbo, a vsakič pri drugi ločljivosti. Resnično poškodbo (pregib v kotu
    razglednice iz 1931) je našel pri obeh. Zato obdržimo samo mesta, kjer se
    maski ujemata (z nekaj pikami tolerance).
    """
    visina, sirina = slika.shape[:2]
    kratka, dolga = min(visina, sirina), max(visina, sirina)
    naravna = max(64, int(dolga * 256 / kratka))
    druga = max(1024, int(naravna * 2))
    a = maska_pri(slika, naravna)
    napredek(35)
    b = maska_pri(slika, druga)
    k = max(5, int(kratka * 0.006) | 1)
    blizu = np.ones((k, k), np.uint8)
    return cv2.bitwise_or(cv2.bitwise_and(a, cv2.dilate(b, blizu)), cv2.bitwise_and(b, cv2.dilate(a, blizu)))


def ukaz_praske(a) -> None:
    """
    Praske in pike: masko naredi naučen detektor (glej detektor_prask), zapolni
    pa jih okolica (Telea). Vse slikovne pike zunaj maske ostanejo NATANČNO
    izvirne; maska se shrani, da je vidno, kaj je bilo spremenjeno.

    Namenoma brez generativnega modela za zapolnitev: ta bi „popravil“ tudi
    stvari, ki niso poškodbe (napise, žice, okenske okvirje).
    """
    slika = beri_sliko(a.vhod)
    kratka = min(slika.shape[:2])
    napredek(10)
    maska = maska_prask(slika)
    napredek(60)
    maska = cv2.dilate(maska, np.ones((3, 3), np.uint8), iterations=1)
    delez = float((maska > 0).mean())

    opomba = None
    # Nad 15 % slike to ni več praska, ampak raztrgana ali zbledela fotografija;
    # Telea bi velike površine zamazala. Tak primer pusti človeku.
    if delez > 0.15:
        opomba = f"Detektor je kot poškodbo označil {delez * 100:.1f} % slike — preveč za zapolnitev iz okolice, prask nisem odstranjeval."
        maska[:] = 0
        delez = 0.0
        popravljena = slika
    else:
        polmer = max(3, int(kratka * 0.002))
        popravljena = cv2.inpaint(slika, maska, polmer, cv2.INPAINT_TELEA) if delez > 0 else slika
    napredek(90)
    pisi_sliko(a.izhod, popravljena)
    cv2.imencode(".png", maska)[1].tofile(a.maska)
    napredek(100)
    izid({"delez": delez, "opomba": opomba})


# --- oznaka -------------------------------------------------------------------


def vzgi_oznako(bgr: np.ndarray, besedilo: str, kje: str = "spodaj-desno") -> np.ndarray:
    slika = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)).convert("RGBA")
    velikost = max(14, int(min(slika.size) * 0.028))
    try:
        pisava = ImageFont.truetype(PISAVA, velikost)
    except OSError:
        pisava = ImageFont.load_default()
    plast = Image.new("RGBA", slika.size, (0, 0, 0, 0))
    risar = ImageDraw.Draw(plast)
    l, t, r, b = risar.textbbox((0, 0), besedilo, font=pisava)
    rob = velikost // 2
    w, h = r - l + 2 * rob, b - t + 2 * rob
    x = slika.width - w - rob if "desno" in kje else rob
    y = slika.height - h - rob if "spodaj" in kje else rob
    risar.rounded_rectangle((x, y, x + w, y + h), radius=rob, fill=(0, 0, 0, 150))
    risar.text((x + rob - l, y + rob - t), besedilo, font=pisava, fill=(255, 255, 255, 235))
    return cv2.cvtColor(np.asarray(Image.alpha_composite(slika, plast).convert("RGB")), cv2.COLOR_RGB2BGR)


def ukaz_oznaka(a) -> None:
    pisi_sliko(a.izhod, vzgi_oznako(beri_sliko(a.vhod), a.besedilo))
    izid({"ok": True})


# --- par (pred / po, enaka velikost) --------------------------------------------


def ukaz_par(a) -> None:
    """Izvirnik in izdelek na isto velikost, da se drsnik na strani ne zamakne."""
    b = beri_sliko(a.b)
    visina, sirina = b.shape[:2]
    # Za splet največ 2400 px — večje brskalnik samo pomanjša.
    faktor = min(1.0, 2400 / max(sirina, visina))
    sirina, visina = sode(int(sirina * faktor)), sode(int(visina * faktor))
    b = cv2.resize(b, (sirina, visina), interpolation=cv2.INTER_AREA)
    izvirnik = beri_sliko(a.a)
    izvirnik = cv2.resize(izvirnik, (sirina, visina), interpolation=cv2.INTER_LANCZOS4)
    pisi_sliko(a.izhod_a, izvirnik, 92)
    pisi_sliko(a.izhod_b, b, 92)
    izid({"sirina": sirina, "visina": visina})


# --- poravnava (nekoč / danes) ---------------------------------------------------


def sivo_za_ujemanje(bgr: np.ndarray, najvec: int) -> tuple[np.ndarray, float]:
    visina, sirina = bgr.shape[:2]
    f = min(1.0, najvec / max(visina, sirina))
    siva = cv2.cvtColor(cv2.resize(bgr, (int(sirina * f), int(visina * f)), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
    # CLAHE izenači kontrast: stara fotografija je bleda, današnja ostra.
    return cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(siva), f


def homografija_razumna(H: np.ndarray, sirina_d: int, visina_d: int, sirina_s: int, visina_s: int) -> bool:
    """Zavrne homografije, ki sliko prezrcalijo, zvijejo ali skrčijo v točko."""
    if H is None or not np.isfinite(H).all():
        return False
    koti = np.float32([[0, 0], [sirina_d, 0], [sirina_d, visina_d], [0, visina_d]]).reshape(-1, 1, 2)
    p = cv2.perspectiveTransform(koti, H).reshape(-1, 2)
    if not cv2.isContourConvex(p.astype(np.float32)):
        return False
    povrsina = cv2.contourArea(p.astype(np.float32))
    razmerje = povrsina / float(sirina_s * visina_s)
    return 0.05 < razmerje < 25


def ujemanje_sift(staro: np.ndarray, danes: np.ndarray):
    """Vrne (H danes->staro v koordinatah sivih slik, inlierji, točke za prikaz)."""
    sift = cv2.SIFT_create(nfeatures=6000)
    k1, d1 = sift.detectAndCompute(staro, None)
    k2, d2 = sift.detectAndCompute(danes, None)
    if d1 is None or d2 is None or len(k1) < 8 or len(k2) < 8:
        return None, 0, None
    matcher = cv2.FlannBasedMatcher({"algorithm": 1, "trees": 5}, {"checks": 64})
    pari = matcher.knnMatch(d2, d1, k=2)
    dobri = [m for m, n in (p for p in pari if len(p) == 2) if m.distance < 0.75 * n.distance]
    if len(dobri) < 8:
        return None, 0, None
    tocke_d = np.float32([k2[m.queryIdx].pt for m in dobri])
    tocke_s = np.float32([k1[m.trainIdx].pt for m in dobri])
    H, maska = cv2.findHomography(tocke_d, tocke_s, cv2.USAC_MAGSAC, 5.0, maxIters=5000, confidence=0.999)
    if H is None:
        return None, 0, None
    notri = maska.ravel().astype(bool)
    return H, int(notri.sum()), (tocke_s[notri], tocke_d[notri])


_loftr = None


def ujemanje_loftr(staro: np.ndarray, danes: np.ndarray):
    """LoFTR (kornia, uteži 'outdoor'): bolje od SIFT, ko se je videz kraja
    močno spremenil. Teče na grafični, zato samo kot druga možnost."""
    global _loftr
    try:
        import torch
        import kornia.feature as KF
    except Exception:
        return None, 0, None
    naprava = "cuda" if torch.cuda.is_available() else "cpu"
    if _loftr is None:
        try:
            _loftr = KF.LoFTR(pretrained="outdoor").eval().to(naprava)
        except Exception as e:
            # Brez LoFTR ostane ročna poravnava — to ni razlog, da naloga pade.
            print(f"LoFTR ni na voljo ({e.__class__.__name__}: {str(e)[:160]}) - samo SIFT", flush=True)
            _loftr = False
    if _loftr is False:
        return None, 0, None

    def tenzor(siva: np.ndarray):
        visina, sirina = siva.shape
        f = 640 / max(visina, sirina)
        v8, s8 = int(visina * f) // 8 * 8, int(sirina * f) // 8 * 8
        m = cv2.resize(siva, (s8, v8), interpolation=cv2.INTER_AREA)
        return torch.from_numpy(m).float()[None, None].to(naprava) / 255.0, (sirina / s8, visina / v8)

    t1, (sx1, sy1) = tenzor(staro)
    t2, (sx2, sy2) = tenzor(danes)
    with torch.inference_mode():
        o = _loftr({"image0": t1, "image1": t2})
    tocke_s = o["keypoints0"].cpu().numpy() * np.float32([sx1, sy1])
    tocke_d = o["keypoints1"].cpu().numpy() * np.float32([sx2, sy2])
    zaupanje = o["confidence"].cpu().numpy()
    dobre = zaupanje > 0.5
    tocke_s, tocke_d = tocke_s[dobre], tocke_d[dobre]
    if len(tocke_s) < 8:
        return None, 0, None
    H, maska = cv2.findHomography(tocke_d, tocke_s, cv2.USAC_MAGSAC, 5.0, maxIters=5000, confidence=0.999)
    if H is None:
        return None, 0, None
    notri = maska.ravel().astype(bool)
    return H, int(notri.sum()), (tocke_s[notri], tocke_d[notri])


def slicice_iz_videa(video: str, delo: Path, najvec: int = 150) -> list[Path]:
    """Dve sličici na sekundo, največ 150 (75 s videa je dovolj za izbiro kadra)."""
    mapa = delo / "slicice"
    mapa.mkdir(parents=True, exist_ok=True)
    for f in mapa.glob("*.jpg"):
        f.unlink()
    subprocess.run(
        [FFMPEG, "-hide_banner", "-loglevel", "error", "-i", video, "-vf", "fps=2,scale='min(1920,iw)':-2",
         "-frames:v", str(najvec), "-q:v", "2", str(mapa / "s%04d.jpg")],
        check=True,
    )
    return sorted(mapa.glob("s*.jpg"))


def je_video(pot: str) -> bool:
    return Path(pot).suffix.lower() in {".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm", ".3gp"}


def notranji_pravokotnik(maska: np.ndarray) -> tuple[int, int, int, int]:
    """Največji pravokotnik (približno), v katerem so vse pike veljavne.
    Požrešno odrezujemo tisto stranico, na kateri je največ neveljavnih pik."""
    visina, sirina = maska.shape
    f = min(1.0, 600 / max(visina, sirina))
    m = cv2.resize(maska, (max(1, int(sirina * f)), max(1, int(visina * f))), interpolation=cv2.INTER_NEAREST) > 0
    y0, y1, x0, x1 = 0, m.shape[0] - 1, 0, m.shape[1] - 1
    while y1 - y0 > 10 and x1 - x0 > 10:
        slabe = {
            "gor": (~m[y0, x0:x1 + 1]).sum(),
            "dol": (~m[y1, x0:x1 + 1]).sum(),
            "levo": (~m[y0:y1 + 1, x0]).sum(),
            "desno": (~m[y0:y1 + 1, x1]).sum(),
        }
        stran, koliko = max(slabe.items(), key=lambda kv: kv[1])
        if koliko == 0:
            break
        if stran == "gor":
            y0 += 1
        elif stran == "dol":
            y1 -= 1
        elif stran == "levo":
            x0 += 1
        else:
            x1 -= 1
    return int(x0 / f), int(y0 / f), int((x1 + 1) / f), int((y1 + 1) / f)


def napisi(bgr: np.ndarray, levo: str | None, desno: str | None) -> np.ndarray:
    slika = bgr
    if levo:
        slika = vzgi_oznako(slika, levo, "zgoraj-levo")
    if desno:
        slika = vzgi_oznako(slika, desno, "zgoraj-desno")
    return slika


def cev_ffmpeg(izhod: str, sirina: int, visina: int, fps: int = 30) -> subprocess.Popen:
    return subprocess.Popen(
        [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24",
         "-s", f"{sirina}x{visina}", "-r", str(fps), "-i", "-", "-c:v", "libx264", "-preset", "medium",
         "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", izhod],
        stdin=subprocess.PIPE,
    )


def glajenje(t: float) -> float:
    return 0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, t)))


def ukaz_poravnaj(a) -> None:
    izhod, delo = Path(a.izhod), Path(a.delo)
    izhod.mkdir(parents=True, exist_ok=True)
    staro = beri_sliko(a.staro)
    staro_sivo, f_s = sivo_za_ujemanje(staro, 1200)
    opomba = None

    if a.tocke:
        # Človek je označil 4 pare točk na starem in izbranem današnjem kadru.
        tocke = json.loads(a.tocke)
        kandidat = beri_sliko(a.kandidat)
        H = cv2.getPerspectiveTransform(np.float32(tocke["danes"]), np.float32(tocke["staro"]))
        najboljsi = {"H": H, "slika": kandidat, "pot": a.kandidat, "inlierji": 4, "metoda": "ročne točke", "prikaz": None}
        napredek(40)
    else:
        kandidati = slicice_iz_videa(a.danes, delo) if je_video(a.danes) else [Path(a.danes)]
        if not kandidati:
            raise SystemExit("iz videa ni bilo mogoče izluščiti nobene sličice")
        napredek(10)
        najboljsi = None
        # 1) SIFT na vseh sličicah (CPU, hitro).
        for i, pot in enumerate(kandidati):
            slika = beri_sliko(str(pot))
            sivo, f_d = sivo_za_ujemanje(slika, 1200)
            H, notri, prikaz = ujemanje_sift(staro_sivo, sivo)
            if H is not None and notri > (najboljsi["inlierji"] if najboljsi else 0):
                # Iz koordinat pomanjšanih slik v polno ločljivost.
                S_s, S_d = np.diag([f_s, f_s, 1.0]), np.diag([f_d, f_d, 1.0])
                H_polno = np.linalg.inv(S_s) @ H @ S_d
                if homografija_razumna(H_polno, slika.shape[1], slika.shape[0], staro.shape[1], staro.shape[0]):
                    najboljsi = {"H": H_polno, "slika": slika, "pot": str(pot), "inlierji": notri, "metoda": "SIFT",
                                 "prikaz": (prikaz, f_s, f_d)}
            napredek(10 + 40 * (i + 1) / len(kandidati))
        # 2) LoFTR, kadar SIFT ni zanesljiv (videz se je preveč spremenil).
        if not najboljsi or najboljsi["inlierji"] < 40:
            korak = max(1, len(kandidati) // 40)
            izbrani = kandidati[::korak]
            for i, pot in enumerate(izbrani):
                slika = beri_sliko(str(pot))
                sivo, f_d = sivo_za_ujemanje(slika, 1200)
                H, notri, prikaz = ujemanje_loftr(staro_sivo, sivo)
                if H is not None and notri > (najboljsi["inlierji"] if najboljsi else 0):
                    S_s, S_d = np.diag([f_s, f_s, 1.0]), np.diag([f_d, f_d, 1.0])
                    H_polno = np.linalg.inv(S_s) @ H @ S_d
                    if homografija_razumna(H_polno, slika.shape[1], slika.shape[0], staro.shape[1], staro.shape[0]):
                        najboljsi = {"H": H_polno, "slika": slika, "pot": str(pot), "inlierji": notri, "metoda": "LoFTR",
                                     "prikaz": (prikaz, f_s, f_d)}
                napredek(50 + 20 * (i + 1) / len(izbrani))

        # Pod 25 skladnimi točkami homografija ni dokaz, ampak ugibanje.
        if not najboljsi or najboljsi["inlierji"] < 25:
            # Za ročno označevanje shranimo sličico z največ ujemanji (ali prvo).
            pot = najboljsi["pot"] if najboljsi else str(kandidati[len(kandidati) // 2])
            kandidat = izhod / "kandidat-danes.jpg"
            pisi_sliko(str(kandidat), beri_sliko(pot), 92)
            # Predogled stare v POLNI ločljivosti: točke se berejo v pikah te
            # slike, izvirnik pa je lahko TIFF, ki ga brskalnik ne prikaže.
            predogled = izhod / "staro-predogled.jpg"
            pisi_sliko(str(predogled), staro, 92)
            izid({"status": "rabi_tocke", "kandidat": str(kandidat), "staro": str(predogled),
                  "inlierji": najboljsi["inlierji"] if najboljsi else 0,
                  "opomba": "Samodejna poravnava ni našla dovolj skladnih točk. Označi 4 pare istih točk (vogali stavb, okna)."})
            return

    # Današnjo sliko preslikamo v koordinate stare (stara ostane nedotaknjena).
    danes = najboljsi["slika"]
    visina, sirina = staro.shape[:2]
    danes_v_staro = cv2.warpPerspective(danes, najboljsi["H"], (sirina, visina), flags=cv2.INTER_LANCZOS4)
    veljavno = cv2.warpPerspective(np.full(danes.shape[:2], 255, np.uint8), najboljsi["H"], (sirina, visina), flags=cv2.INTER_NEAREST)
    veljavno = cv2.erode(veljavno, np.ones((5, 5), np.uint8))
    x0, y0, x1, y1 = notranji_pravokotnik(veljavno)
    pokritost = (x1 - x0) * (y1 - y0) / float(sirina * visina)
    if pokritost < 0.3:
        opomba = f"Današnji posnetek pokrije le {pokritost * 100:.0f} % stare fotografije — izrez je majhen."
    staro_izrez = staro[y0:y1, x0:x1]
    danes_izrez = danes_v_staro[y0:y1, x0:x1]
    # Za splet največ 2400 px, sode mere (H.264).
    f = min(1.0, 2400 / max(staro_izrez.shape[:2]))
    s2, v2 = sode(int(staro_izrez.shape[1] * f)), sode(int(staro_izrez.shape[0] * f))
    staro_izrez = cv2.resize(staro_izrez, (s2, v2), interpolation=cv2.INTER_AREA)
    danes_izrez = cv2.resize(danes_izrez, (s2, v2), interpolation=cv2.INTER_AREA)
    pisi_sliko(str(izhod / "staro.jpg"), staro_izrez, 92)
    pisi_sliko(str(izhod / "danes.jpg"), danes_izrez, 92)
    napredek(75)

    # Pregled ujemanja: stara in današnja slika z zelenimi skladnimi točkami.
    prikaz = najboljsi.get("prikaz")
    if prikaz:
        (tocke_s, tocke_d), f_s2, f_d2 = prikaz
        a1 = cv2.resize(staro, (int(staro.shape[1] * f_s2), int(staro.shape[0] * f_s2)))
        a2 = cv2.resize(danes, (int(danes.shape[1] * f_d2), int(danes.shape[0] * f_d2)))
        vis = max(a1.shape[0], a2.shape[0])
        platno = np.zeros((vis, a1.shape[1] + a2.shape[1], 3), np.uint8)
        platno[: a1.shape[0], : a1.shape[1]] = a1
        platno[: a2.shape[0], a1.shape[1]:] = a2
        for (xs, ys), (xd, yd) in list(zip(tocke_s, tocke_d))[:200]:
            cv2.line(platno, (int(xs), int(ys)), (int(xd + a1.shape[1]), int(yd)), (60, 220, 60), 1, cv2.LINE_AA)
        pisi_sliko(str(izhod / "ujemanje.jpg"), platno, 85)
    else:
        pisi_sliko(str(izhod / "ujemanje.jpg"), np.hstack([staro_izrez, danes_izrez]), 85)

    # Slika drsnika: levo nekoč, desno danes, bela črta na sredini.
    sredina = s2 // 2
    drsnik = danes_izrez.copy()
    drsnik[:, :sredina] = staro_izrez[:, :sredina]
    cv2.rectangle(drsnik, (sredina - 1, 0), (sredina + 1, v2), (255, 255, 255), -1)
    pisi_sliko(str(izhod / "drsnik.jpg"), napisi(drsnik, "NEKOČ", "DANES"), 92)
    napredek(80)

    # Video s prelivom: nekoč 2 s, preliv 1,5 s, danes 2 s, preliv nazaj 1,5 s.
    fps = 30
    staro_n = napisi(staro_izrez, "NEKOČ", None)
    danes_n = napisi(danes_izrez, None, "DANES")
    cev = cev_ffmpeg(str(izhod / "preliv.mp4"), s2, v2, fps)

    def drzi(okvir: np.ndarray, sekund: float) -> None:
        for _ in range(int(sekund * fps)):
            cev.stdin.write(okvir.tobytes())

    def prelij(od: np.ndarray, do: np.ndarray, sekund: float) -> None:
        n = int(sekund * fps)
        for i in range(n):
            t = glajenje(i / (n - 1))
            cev.stdin.write(cv2.addWeighted(od, 1 - t, do, t, 0).tobytes())

    drzi(staro_n, 2.0)
    prelij(staro_n, danes_n, 1.5)
    drzi(danes_n, 2.0)
    prelij(danes_n, staro_n, 1.5)
    cev.stdin.close()
    cev.wait()
    napredek(90)

    # Video z drsnikom: črta potuje levo -> desno -> levo.
    cev = cev_ffmpeg(str(izhod / "drsnik.mp4"), s2, v2, fps)
    n = 7 * fps
    for i in range(n):
        t = i / (n - 1)
        polozaj = glajenje(t * 2) if t < 0.5 else glajenje(2 - t * 2)
        x = int(polozaj * s2)
        okvir = danes_izrez.copy()
        okvir[:, :x] = staro_izrez[:, :x]
        cv2.rectangle(okvir, (max(0, x - 1), 0), (min(s2 - 1, x + 1), v2), (255, 255, 255), -1)
        cev.stdin.write(napisi(okvir, "NEKOČ", "DANES").tobytes())
    cev.stdin.close()
    cev.wait()
    napredek(100)

    kandidat = izhod / "kandidat-danes.jpg"
    if not kandidat.exists():
        pisi_sliko(str(kandidat), danes, 92)
    izid({"status": "koncano", "kandidat": str(kandidat), "inlierji": najboljsi["inlierji"],
          "metoda": najboljsi["metoda"], "pokritost": round(pokritost, 3), "opomba": opomba})


# --- paralaksa ------------------------------------------------------------------


def ukaz_paralaksa(a) -> None:
    """
    2,5D gibanje: vsaka slikovna pika se premakne sorazmerno z bližino (globinska
    karta), kamera pa se počasi pomika. Bližnji predmeti se premikajo več kot
    daljni — to je vtis prostora. Premiki so majhni (nekaj % širine), da se ne
    vidijo raztegnjeni robovi za predmeti, ki jih ena fotografija ne vidi.
    """
    slika = beri_sliko(a.slika)
    visina, sirina = slika.shape[:2]
    f = min(1.0, 1920 / max(visina, sirina))
    sirina, visina = sode(int(sirina * f)), sode(int(visina * f))
    slika = cv2.resize(slika, (sirina, visina), interpolation=cv2.INTER_AREA)

    globina = cv2.cvtColor(beri_sliko(a.globina), cv2.COLOR_BGR2GRAY).astype(np.float32)
    globina = cv2.resize(globina, (sirina, visina), interpolation=cv2.INTER_CUBIC)
    # Depth Anything vrne relativno inverzno globino: svetlo = blizu.
    lo, hi = np.percentile(globina, 2), np.percentile(globina, 98)
    globina = np.clip((globina - lo) / max(1e-3, hi - lo), 0, 1)
    # Gladka globina = manj trganja na robovih predmetov.
    globina = cv2.bilateralFilter(globina, 9, 0.1, 9)
    globina = cv2.GaussianBlur(globina, (0, 0), max(1.0, sirina * 0.004))

    fps = 30
    n = int(float(a.sekund) * fps)
    moc = float(a.moc)
    mx, my = np.meshgrid(np.arange(sirina, dtype=np.float32), np.arange(visina, dtype=np.float32))
    cx, cy = sirina / 2, visina / 2
    amp = 0.022 * sirina * moc
    cev = cev_ffmpeg(a.izhod, sirina, visina, fps)
    for i in range(n):
        t = i / max(1, n - 1)
        e = glajenje(t)
        if a.gibanje == "levo-desno":
            zoom = 1.08
            dx = amp * (e - 0.5) * 2 * (globina - 0.5)
            dy = 0.0 * globina
        elif a.gibanje == "krog":
            zoom = 1.08
            kot = 2 * math.pi * t
            dx = amp * math.sin(kot) * (globina - 0.5)
            dy = amp * 0.5 * math.cos(kot) * (globina - 0.5)
        else:  # priblizaj: bližnje raste hitreje od daljnega
            zoom = 1.04 + 0.10 * moc * e * (0.35 + 0.65 * globina)
            dx = 0.0 * globina
            dy = 0.0 * globina
        map_x = (cx + (mx - cx) / zoom - dx).astype(np.float32)
        map_y = (cy + (my - cy) / zoom - dy).astype(np.float32)
        okvir = cv2.remap(slika, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        cev.stdin.write(okvir.tobytes())
        if i % 10 == 0:
            napredek(100 * i / n)
    cev.stdin.close()
    koda = cev.wait()
    if koda != 0:
        raise SystemExit(f"ffmpeg je koncal s kodo {koda}")
    napredek(100)
    izid({"sirina": sirina, "visina": visina, "slicic": n})


def main() -> None:
    p = argparse.ArgumentParser()
    sp = p.add_subparsers(dest="ukaz", required=True)

    s = sp.add_parser("info")
    s.add_argument("--vhod", required=True)

    s = sp.add_parser("praske")
    s.add_argument("--vhod", required=True)
    s.add_argument("--izhod", required=True)
    s.add_argument("--maska", required=True)

    s = sp.add_parser("oznaka")
    s.add_argument("--vhod", required=True)
    s.add_argument("--izhod", required=True)
    s.add_argument("--besedilo", required=True)

    s = sp.add_parser("par")
    s.add_argument("--a", required=True)
    s.add_argument("--b", required=True)
    s.add_argument("--izhod-a", dest="izhod_a", required=True)
    s.add_argument("--izhod-b", dest="izhod_b", required=True)

    s = sp.add_parser("poravnaj")
    s.add_argument("--staro", required=True)
    s.add_argument("--danes", required=True)
    s.add_argument("--izhod", required=True)
    s.add_argument("--delo", required=True)
    s.add_argument("--tocke")
    s.add_argument("--kandidat")

    s = sp.add_parser("paralaksa")
    s.add_argument("--slika", required=True)
    s.add_argument("--globina", required=True)
    s.add_argument("--izhod", required=True)
    s.add_argument("--sekund", default="6")
    s.add_argument("--gibanje", default="priblizaj")
    s.add_argument("--moc", default="1")

    a = p.parse_args()
    {
        "info": ukaz_info,
        "praske": ukaz_praske,
        "oznaka": ukaz_oznaka,
        "par": ukaz_par,
        "poravnaj": ukaz_poravnaj,
        "paralaksa": ukaz_paralaksa,
    }[a.ukaz](a)


if __name__ == "__main__":
    main()
