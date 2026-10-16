# 애프터 브랜드 자산

## 2026-10-16 UI 정돈

- 심벌과 앱 아이콘은 유지하고, 화면 헤더는 중복된 `a + after` 대신 코럴 점을 붙인 `after` 워드마크로 단순화했다.
- 바탕은 노란 크림에서 옅은 오프화이트로, 카드는 흰색으로 정리했다. 잉크색 주 버튼과 작은 코럴 강조는 유지한다.
- 제목·이름·본문은 Pretendard, 한 줄 소개의 인용만 Gowun Batang을 쓴다. 새 화면에서 명조를 제목에 다시 확대하지 않는다.
- `/brand/after-hours.jpg`는 기존 캠페인의 AI 생성 카페 장면을 웹용으로 최적화한 장식 이미지다. 실제 제휴 장소나 회원의 만남 사진으로 설명하지 않는다.
- Emil Kowalski의 `emil-design-eng`, `apple-design`, `mobile-native` 원칙을 적용했다. 눌림은 140ms, 가입 진행률은 transform 200ms, 모션 줄이기 설정을 존중한다. 실물 iOS/Android의 키보드·터치 감각은 별도로 확인한다.

아래는 기존 아이콘 제작 기준이다. 화면 색·타이포그래피는 위 기준을 우선한다.

현재 기준은 [리브랜딩 설계안](after-rebrand-plan.md)이다. 2026-10-11 심벌을 바꿨다: 같은 a 에 점을 키우고(r 3.4) 블러시(#F08A8A, 크림 바탕 화면에서는 #EB7B78)로 칠했다. 배경 잉크 #23302B, 글자 크림 #FAF6EE. 워드마크·심벌 SVG가 원본이며, 화면 마크는 [Logo.tsx](../src/components/Logo.tsx), 웹 아이콘은 [favicon.svg](../public/favicon.svg), iOS 아이콘은 [app-icon-ios.svg](../brand/app-icon-ios.svg), 실행 화면은 [splash.svg](../brand/splash.svg)에서 관리한다.

## 래스터 자산 재생성

macOS의 Chrome과 `sips`를 사용한다. 벡터를 고친 뒤 저장소 루트에서 실행한다.

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# favicon.svg 는 width/height 가 64 라 그대로 찍으면 512 캔버스 왼쪽 위 64px 에만
# 그려진다(2026-10-11 까지 실제로 그렇게 배포됐다). 512 로 바꾼 사본을 찍는다.
sed 's/width="64" height="64"/width="512" height="512"/' public/favicon.svg > /tmp/favicon-512.svg
"$CHROME" --headless --disable-gpu --force-device-scale-factor=1 \
  --screenshot="$PWD/public/icon-512.png" --window-size=512,512 \
  --default-background-color=00000000 "file:///tmp/favicon-512.svg"
python3 -c "from PIL import Image; Image.open('public/icon-512.png').save('public/favicon.ico', sizes=[(16,16),(32,32),(48,48)])"

"$CHROME" --headless --disable-gpu --force-device-scale-factor=1 \
  --screenshot="$PWD/brand/app-store-1024.png" --window-size=1024,1024 \
  --default-background-color=ffffffff "file://$PWD/brand/app-icon-ios.svg"
cp brand/app-store-1024.png ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
# 홈 화면 아이콘은 iOS 가 직접 모서리를 깎는다. 투명 모서리가 있으면 검게 보이므로
# 둥근 favicon 이 아니라 꽉 찬 스토어 아이콘에서 줄인다.
sips -z 180 180 brand/app-store-1024.png --out public/apple-touch-icon.png

"$CHROME" --headless --disable-gpu --force-device-scale-factor=1 \
  --screenshot="$PWD/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png" \
  --window-size=2732,2732 --default-background-color=ffffffff "file://$PWD/brand/splash.svg"
cp ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png
cp ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png
```

`public/favicon.ico`는 PNG 이미지가 포함된 ICO 컨테이너다. SVG나 색을 바꾸면 기존 아이콘들과 함께 다시 내보내야 하며, 파비콘·홈 화면 아이콘·스토어 아이콘·iOS 스플래시가 같은 시각 체계를 유지하는지 확인한다.

스토어 스크린샷은 아이콘과 별도 산출물이다. UI 문구나 색이 바뀌면 [App Store 제출 자료](appstore-submission.md)의 캡처를 다시 만들고, 과거 화면을 제출하지 않는다.
