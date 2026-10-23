# 돌보니(Dolboni) 프로젝트 요구사항 명세서

> 원본 파일: `c:\Users\june\Downloads\포르젝트.txt`  
> 연동 대상: 시모니 1.0 (Simoni 1.0) Supabase(PostgreSQL) DB

---

## 1. 프로젝트 개요
'돌보니(Dolboni)' 앱이 기존 '시모니(Simoni 1.0)' 플랫폼의 Supabase(PostgreSQL) DB와 완벽히 연동되어 개인별 포인트 적립과 소방서/센터/팀별 익명 통계를 산출할 수 있도록 데이터베이스 스키마(schema.sql)와 앱 내 상태 관리 로직을 고도화.

---

## 2. 상세 요구사항

### 1) Supabase DB 스키마 설계 (`schema.sql` 작성)
- **`profiles` (시모니 연동 사용자 테이블 확장)**:
  - `id` (UUID, auth.users 또는 시모니 연동)
  - `station_name` (소방서)
  - `center_name` (안전센터/구조대)
  - `team_name` (교대조 1/2/3팀)
  - `total_points` (누적 포인트)
- **`dolboni_mood_logs` (시계열 감정/각성 기록)**:
  - `id`
  - `user_id`
  - `check_type` ('routine' | 'pre' | 'post' | 'followup_24h' | 'followup_72h')
  - `work_status` ('after_dispatch' | 'night_standby' | 'off_duty')
  - `valence_score` (-5 ~ 5)
  - `arousal_score` (1 ~ 10)
  - `session_id` (nullable)
  - `created_at`
- **`dolboni_sessions` (명상 수행 기록)**:
  - `id`
  - `user_id`
  - `program_type`
  - `duration_seconds`
  - `pre_arousal`
  - `post_arousal`
  - `tension_drop` (생성 열 GENERATED ALWAYS AS 또는 트리거로 pre - post 계산)
  - `created_at`
- **`dolboni_point_ledger` (포인트 내역)**:
  - `id`
  - `user_id`
  - `point_amount`
  - `reason`
  - `created_at`
  - **비즈니스 로직**: 포인트 적립 시 `profiles`의 `total_points`가 자동 업데이트되는 PostgreSQL Trigger 함수 포함, 일일 적립 상한선 체크 로직 반영
- **`team_statistics_view` (본부 보고용 익명 통계 View)**:
  - `station_name`, `center_name`, `team_name` 별로 그룹화
  - 총 사용 시간, 평균 사용 시간, 참여 인원수, 명상 전후 평균 긴장도 감소 폭 (`AVG(tension_drop)`)을 실시간 산출
  - 개인 식별 정보(개인 ID, 성명 등)는 완전 제외

---

### 2) 앱 UI 반영 사항
- **상단 헤더**: 대원의 현재 보유 포인트(마음건강 마일리지) 배지 표시
- **호흡 가이드 / 세션 완료 인터랙션**: 완료 후 사후 체크인을 마치면 `+50 포인트가 적립되었습니다 (긴장도 3점 완화!)` 같은 즉각적인 리워드 토스트 알림 표시
- **'나의 회복 기록' 탭 하단**: `우리 센터/팀 함께 돌보기 현황` 카드를 추가하여, 우리 팀의 이번 달 누적 회복 시간과 목표 달성률 프로그레스 바 표시
