# 돌보니 (Dolboni) 네이티브 어플(APK) 빌드 및 QR 배포 가이드

> **구조**: Capacitor 8.0 기반 하이브리드 네이티브 앱  
> **패키지명**: `kr.co.valueplus.dolboni`  
> **배포 방식**: 스토어 심사 없는 **직접 APK 다운로드 링크 및 QR 코드 배포**

---

## 1. 탑재된 기기 제어 기능
- **진동 (Haptics)**: 들숨(Inhale) 시 부드러운 롱 펄스 진동, 숨 멈춤(Hold) 시 가벼운 틱 진동, 날숨(Exhale) 시 이완 진동
- **오디오 차임 (Web Audio / Background)**: 396Hz / 285Hz 치유 솔페지오 주파수 합성음 (화면 꺼짐 대비 오디오 지원)
- **리워드 인터랙션**: 세션 사후 체크인 즉시 `+50P 마일리지 적립 (긴장도 3점 완화!)` 애니메이션 토스트 표출
- **함께 돌보기 현황**: '나의 회복 기록' 탭 하단 우리 센터/팀 월간 누적 시간 및 목표 달성률 실시간 프로그레스 바

---

## 2. APK 빌드 방법 (2가지)

### 방법 A: GitHub Actions 자동 빌드 (가장 추천 / PC 설정 불필요)
1. 코드를 GitHub 저장소로 푸시하면 `.github/workflows/build-dolboni-apk.yml`이 자동 실행됩니다.
2. 약 3분 뒤 GitHub 저장소의 **Actions** 탭에서 생성된 `dolboni-latest.apk` 파일을 즉시 다운로드할 수 있습니다.
3. 이 APK 다운로드 링크를 QR 코드로 변환하여 소방서/센터에 배포합니다.

### 방법 B: 로컬 개발 PC에서 직접 빌드 (Android Studio 설치 시)
1. `dolboni/` 디렉터리에서 Android Studio 실행:
   ```bash
   npx cap open android
   ```
2. Android Studio 메뉴에서 **Build ➜ Build Bundle(s) / APK(s) ➜ Build APK(s)** 클릭.
3. 생성 경로: `dolboni/android/app/build/outputs/apk/debug/app-debug.apk`

---

## 3. 현장 QR 코드 배포 방법
1. 빌드된 `dolboni-latest.apk` 파일을 Supabase Storage 또는 웹 서버에 업로드합니다:
   - 예: `https://[Supabase URL]/storage/v1/object/public/dolboni-downloads/dolboni.apk`
2. 해당 다운로드 URL을 무료 QR 코드 생성기(또는 Python 스크립트)로 QR 이미지로 출력합니다.
3. 소방서 게시판이나 안전센터 메신저(카카오톡/텔레그램)에 배포하면 대원들이 즉시 설치하여 사용합니다.
