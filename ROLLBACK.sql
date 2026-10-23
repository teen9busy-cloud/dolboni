-- ==============================================================================
-- 돌보니 (Dolboni) 통합 스키마 긴급 롤백 스크립트 (ROLLBACK.sql v2.0)
-- 기존 시모니 1.0의 객체는 일절 건드리지 않고, 돌보니 전용 객체만 안전하게 정리
-- ==============================================================================

-- 1. 함수 및 View 제거
DROP VIEW IF EXISTS team_statistics_view CASCADE;
DROP FUNCTION IF EXISTS dolboni_complete_session(VARCHAR, INT, INT, INT, INT, INT, VARCHAR) CASCADE;

-- 2. 돌보니 신규 테이블 제거 (외래키 역순)
DROP TABLE IF EXISTS dolboni_counsel_requests CASCADE;
DROP TABLE IF EXISTS dolboni_team_goals CASCADE;
DROP TABLE IF EXISTS dolboni_point_ledger CASCADE;
DROP TABLE IF EXISTS dolboni_mood_logs CASCADE;
DROP TABLE IF EXISTS dolboni_sessions CASCADE;
DROP TABLE IF EXISTS dolboni_members CASCADE;
