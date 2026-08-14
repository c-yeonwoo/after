# 브랜드 자산

로고 마크를 고칠 때 함께 다시 뽑아야 하는 것들과, 뽑는 방법.

---

## 마크

**같은 크기의 원 둘. 하나는 채워져 있고 하나는 열려 있다.**

이름을 그림으로 설명하지 않는다 — 앞선 마크(지평선에 걸린 해)가 올드하게 읽힌
이유가 그것이었다. 대신 서비스가 하는 일을 그린다. 한 번에 **한 사람만**
소개하고(원 둘, 그 이상 없음), 그중 한 사람은 **아직 열리지 않았다**(윤곽만).
사선으로 놓아 하나는 내려가고 하나는 올라온다 — 저녁이라는 시간을 해를 그리지
않고 리듬으로만 남긴 자리다.

### 왜 면 + 선인가

후보를 실제 크기로 렌더해 비교했다(16·20·24·32·56px, 명/암, 코럴 타일).

| 안 | 16px 결과 |
|---|---|
| 윤곽 원 둘 | 두 링이 붙어 뭉갠다. 앞서 접은 "누운 하트" 와 같은 실패 |
| 면 둘 | 이음선이 사라져 땅콩 하나로 읽힌다 |
| **면 하나 + 링 하나** | 두 요소의 성격이 달라 작아져도 둘로 읽힌다 |

질량과 선을 대비시키는 것이 같은 것 둘을 나란히 두는 것보다 작은 크기에서 강하다.
이 관찰이 형태를 결정했다.

### 세 벌로 유지한다

| | 파일 | 배경 | 이음선 | 링 두께 |
|---|---|---|---|---|
| 화면 | `src/components/Logo.tsx` | 없음(`currentColor`) | `mask` | 3.2 |
| 파비콘 | `public/favicon.svg` | 둥근 타일(`rx=15`) | 코럴 원 겹쳐 그리기 | 4.4 |
| 앱 아이콘 | `brand/app-icon-ios.svg` | **사각 전면** | 코럴 원 겹쳐 그리기 | 4.4 |

**앱 아이콘이 따로 있는 이유**: 파비콘은 스스로 둥근 타일이라 코너가 투명하다.
iOS 는 투명을 검게 칠하고 그 위에 자기 스퀴클 마스크를 씌우므로, 같은 파일을 쓰면
둥근 모서리 바깥에 **검은 삼각형 네 개**가 남는다. 앱스토어 심사도 아이콘의 투명을
받지 않는다. 앱 아이콘은 모서리를 깎지 않고 배경을 전면으로 채운다 — 둥글리는 일은
OS 가 한다.

마크 위치도 다르다. bounding box 중심이 캔버스 중심과 어긋나 있어(아래 참고) scale
만 주면 한쪽으로 몰린다.

    마크 bbox(32 단위): x 4.4~28.8, y 3.2~27.6 → 중심 (16.6, 15.4)
    translate = 32 - scale × (16.6, 15.4)

앱 아이콘은 `scale 1.45` 로 마크가 캔버스의 **약 55%** 다. 처음 1.18 로 뽑았더니
46% 로 작아 아이콘 안에서 겉돌았다(관례는 55~60%).

- **치수가 다른 이유**: 파비콘이 실제로 그려지는 크기는 16px 이고, 타일 안쪽 여백을
  빼면 마크에 10px 남짓만 남는다. 그 크기에서 3.2 두께 링은 사라진다.
- **구현이 다른 이유**: `mask` 를 쓴 SVG 를 PNG 로 뽑으면 **링이 팔각형으로 깨진다**
  (래스터라이저가 mask 를 낮은 해상도로 처리한다). 배경색을 아는 자산이라 겹쳐
  그리기가 가능하고, 그 편이 어떤 변환기를 거쳐도 안전하다. 컴포넌트는
  `currentColor` 라 배경을 모르므로 그쪽은 mask 가 맞다.

하나로 맞추려면 큰 화면의 마크가 둔해지거나 파비콘이 뭉개지는 것 중 하나를
골라야 했다. 두 벌 유지가 그보다 싸다.

---

## 다시 뽑는 방법

`public/favicon.svg` 가 모든 래스터 자산의 원본이다. 그것만 고친 뒤 아래를 돌린다.

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SVG="$PWD/public/favicon.svg"
TMP=$(mktemp -d)

# 큰 것은 Chrome 으로 직접 렌더한다.
# ⚠️ 창 크기가 50px 아래면 Chrome 이 빈 이미지를 낸다 — 작은 것은 축소로 만든다.
for S in 512 1024; do
  "$CHROME" --headless --disable-gpu --force-device-scale-factor=1 \
    --screenshot="$TMP/icon-$S.png" --window-size=$S,$S \
    --default-background-color=00000000 "file://$SVG"
done

# 작은 것은 512 에서 축소한다(sips 는 macOS 기본 도구).
for S in 16 32 48 180; do
  cp "$TMP/icon-512.png" "$TMP/r-$S.png" && sips -z $S $S "$TMP/r-$S.png"
done

cp "$TMP/r-180.png"    public/apple-touch-icon.png
cp "$TMP/icon-512.png" public/icon-512.png
```

앱 아이콘은 **원본이 다르다**(`brand/app-icon-ios.svg`). 투명이 없어야 하므로
배경을 흰색으로 지정해 렌더한다 — `--default-background-color=00000000` 을 쓰면
알파 채널이 생긴다.

```bash
"$CHROME" --headless --disable-gpu --force-device-scale-factor=1 \
  --screenshot="$TMP/ios-1024.png" --window-size=1024,1024 \
  --default-background-color=ffffffff "file://$PWD/brand/app-icon-ios.svg"

cp "$TMP/ios-1024.png" brand/app-store-1024.png
cp "$TMP/ios-1024.png" \
   'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'
```

`favicon.ico` 는 16·32·48 을 한 파일에 담아야 한다(윈도우·구형 브라우저가
크기별로 골라 쓴다). 표준 라이브러리로 직접 조립한다.

```bash
python3 - "$TMP" <<'PY'
import struct, sys
tmp = sys.argv[1]
imgs = [(s, open(f'{tmp}/r-{s}.png', 'rb').read()) for s in (16, 32, 48)]
head = struct.pack('<HHH', 0, 1, len(imgs))
offset, entries, blobs = 6 + 16 * len(imgs), bytearray(), bytearray()
for s, data in imgs:
    entries += struct.pack('<BBBBHHII', s, s, 0, 0, 1, 32, len(data), offset)
    blobs += data
    offset += len(data)
open('public/favicon.ico', 'wb').write(head + bytes(entries) + bytes(blobs))
PY
```

### 확인

- `favicon.ico` 안의 PNG 가 실제로 그려졌는지 본다 — 빈 이미지도 구조는 유효하다.
  16x16 이 700바이트 아래면 의심한다(코럴 타일이 있으므로 그보다 작아질 수 없다).
- 밝은 탭바·어두운 탭바 양쪽에서 실루엣이 남는지 본다.
- iOS·앱스토어 아이콘에 **알파 채널이 없어야 한다.** PNG color type 이 2(RGB)여야
  하고 6(RGBA)이면 안 된다.

  ```bash
  python3 -c "
  import struct; d=open('brand/app-store-1024.png','rb').read()
  print('color type', struct.unpack('>IIBB', d[16:26])[3], '(2=RGB 정상, 6=RGBA 문제)')"
  ```

- 시뮬레이터 홈 화면에서 실제로 본다 — 코너에 검은 삼각형이 없어야 한다.

---

## 워드마크

`BRAND.nameEn` = **After Sunset**. 정식 라틴 표기이며 소문자로 쓰지 않는다
(고유명사). 도메인이 `aftersunset.kr` 이므로 표기와 도메인이 한 브랜드로 읽힌다.

한국어는 두 층으로 쓴다 — 정식 `애프터선셋`, 본문·메일 `애프터`. 근거는
`src/lib/brand.ts` 에 적혀 있다(6음절이 길고, "애프터" 가 한국어 데이팅 은어와
겹치는 것이 오히려 유리하다).

---

## 색

| 용도 | 값 |
|---|---|
| 마크·강조 | `#c72b10` (= `--brand-700`) |
| 타일 위 마크 | `#FFF3EE` |

`--brand-700` 은 대비 기준을 통과시키려 한 번 조정된 값이다(`src/styles.css` 참고).
아이콘 자산에는 hex 를 직접 쓴다 — SVG 파일은 CSS 변수를 읽을 수 없다.
