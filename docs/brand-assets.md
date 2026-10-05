# 애프터 브랜드 자산

현재 기준은 [리브랜딩 설계안](after-rebrand-plan.md)이다. 워드마크·심벌 SVG가 원본이며, 화면 마크는 [Logo.tsx](../src/components/Logo.tsx), 웹 아이콘은 [favicon.svg](../public/favicon.svg), iOS 아이콘은 [app-icon-ios.svg](../brand/app-icon-ios.svg), 실행 화면은 [splash.svg](../brand/splash.svg)에서 관리한다.

## 래스터 자산 재생성

macOS의 Chrome과 `sips`를 사용한다. 벡터를 고친 뒤 저장소 루트에서 실행한다.

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

"$CHROME" --headless --disable-gpu --force-device-scale-factor=1 \
  --screenshot="$PWD/public/icon-512.png" --window-size=512,512 \
  --default-background-color=00000000 "file://$PWD/public/favicon.svg"
sips -z 180 180 public/icon-512.png --out public/apple-touch-icon.png

"$CHROME" --headless --disable-gpu --force-device-scale-factor=1 \
  --screenshot="$PWD/brand/app-store-1024.png" --window-size=1024,1024 \
  --default-background-color=ffffffff "file://$PWD/brand/app-icon-ios.svg"
cp brand/app-store-1024.png ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png

"$CHROME" --headless --disable-gpu --force-device-scale-factor=1 \
  --screenshot="$PWD/ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png" \
  --window-size=2732,2732 --default-background-color=ffffffff "file://$PWD/brand/splash.svg"
cp ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png
cp ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png
```

`public/favicon.ico`는 PNG 이미지가 포함된 ICO 컨테이너다. SVG나 색을 바꾸면 기존 아이콘들과 함께 다시 내보내야 하며, 파비콘·홈 화면 아이콘·스토어 아이콘·iOS 스플래시가 같은 시각 체계를 유지하는지 확인한다.

스토어 스크린샷은 아이콘과 별도 산출물이다. UI 문구나 색이 바뀌면 [App Store 제출 자료](appstore-submission.md)의 캡처를 다시 만들고, 과거 화면을 제출하지 않는다.
