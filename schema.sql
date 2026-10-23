-- ==============================================================================
-- 돌보니 (Dolboni) 통합 스키마 (schema.sql v2.0)
-- 밸류플러스 AI 사내 협업 지침에 따른 설계 및 구현
-- 감수: 클 과장 (Claude Opus 5.5) | 총괄: 안 대리 (Antigravity) | 보조: 코 사원 (Copilot)
-- 기준 DB: 시모니 1.0 운영 DB (jrpbdhhnyyjsuohnvapu)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. 돌보니 회원 마스터 (dolboni_members)
-- 소방공무원(clients 연동)과 소방관 DB에 없는 사람(공무직, 기간제 등)을 모두 수용
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dolboni_members (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    member_type VARCHAR(20) NOT NULL CHECK (member_type IN ('firefighter', 'civilian', 'external')),
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,            -- 소방공무원 매핑 (clients.id)
    direct_region_id UUID REFERENCES regions(id) ON DELETE RESTRICT,    -- 공무직/외부인원 소속 관서 (시모니 regions)
    station_name VARCHAR(100) NOT NULL,                                 -- 소속 소방서
    center_name VARCHAR(100) NOT NULL,                                  -- 안전센터/구조대/팀
    team_name VARCHAR(20) NOT NULL CHECK (team_name IN ('1팀', '2팀', '3팀', '주간근무', '상근')),
    display_name VARCHAR(50),                                           -- 앱 내 표시명
    total_points INT NOT NULL DEFAULT 0 CHECK (total_points >= 0),      -- 보유 마일리지
    share_with_counselor BOOLEAN NOT NULL DEFAULT FALSE,                -- 상담사 데이터 공유 동의 여부
    is_active BOOLEAN NOT NULL DEFAULT TRUE,                            -- 이용 활성 상태 (퇴직 시 false)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dolboni_members_org ON dolboni_members(station_name, center_name, team_name);
CREATE INDEX IF NOT EXISTS idx_dolboni_members_client ON dolboni_members(client_id);
CREATE INDEX IF NOT EXISTS idx_dolboni_members_type ON dolboni_members(member_type, is_active);

-- ------------------------------------------------------------------------------
-- 2. 명상 및 회복 세션 수행 기록 (dolboni_sessions)
-- 수행 당시의 소속 스냅샷을 기록하여 인사이동(전근) 후에도 이전 팀 통계 보존
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dolboni_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES dolboni_members(id) ON DELETE CASCADE,
    program_type VARCHAR(100) NOT NULL,                                 -- 호흡/명상 프로그램명
    duration_seconds INT NOT NULL CHECK (duration_seconds > 0),          -- 수행 시간(초)
    pre_arousal INT NOT NULL CHECK (pre_arousal BETWEEN 1 AND 10),      -- 사전 긴장도
    post_arousal INT NOT NULL CHECK (post_arousal BETWEEN 1 AND 10),    -- 사후 긴장도
    tension_drop INT GENERATED ALWAYS AS (pre_arousal - post_arousal) STORED, -- 완화폭
    -- 수행 당시 소속 스냅샷 (전근 이력 보존용)
    station_snapshot VARCHAR(100) NOT NULL,
    center_snapshot VARCHAR(100) NOT NULL,
    team_snapshot VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dolboni_sessions_user ON dolboni_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dolboni_sessions_stat ON dolboni_sessions(station_snapshot, center_snapshot, team_snapshot, created_at);

-- ------------------------------------------------------------------------------
-- 3. 시계열 감정 및 각성 기록 (dolboni_mood_logs)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dolboni_mood_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES dolboni_members(id) ON DELETE CASCADE,
    check_type VARCHAR(30) NOT NULL CHECK (
        check_type IN ('routine', 'pre', 'post', 'followup_24h', 'followup_72h')
    ),
    work_status VARCHAR(30) NOT NULL CHECK (
        work_status IN ('after_dispatch', 'night_standby', 'off_duty')
    ),
    valence_score INT NOT NULL CHECK (valence_score BETWEEN -5 AND 5),  -- -5 ~ +5
    arousal_score INT NOT NULL CHECK (arousal_score BETWEEN 1 AND 10),  -- 1 ~ 10
    session_id UUID REFERENCES dolboni_sessions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dolboni_mood_user ON dolboni_mood_logs(user_id, created_at DESC);

-- ------------------------------------------------------------------------------
-- 4. 포인트(마일리지) 원장 (dolboni_point_ledger)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dolboni_point_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES dolboni_members(id) ON DELETE CASCADE,
    point_amount INT NOT NULL CHECK (point_amount > 0),
    reason VARCHAR(200) NOT NULL,
    session_id UUID REFERENCES dolboni_sessions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dolboni_ledger_user ON dolboni_point_ledger(user_id, created_at DESC);

-- ------------------------------------------------------------------------------
-- 5. 팀별 월간 목표 관리 (dolboni_team_goals)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dolboni_team_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    station_name VARCHAR(100) NOT NULL,
    center_name VARCHAR(100) NOT NULL,
    team_name VARCHAR(20) NOT NULL,
    target_month VARCHAR(7) NOT NULL,                                  -- 'YYYY-MM'
    goal_duration_seconds INT NOT NULL DEFAULT 36000,                  -- 기본 10시간
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_team_monthly_goal UNIQUE (station_name, center_name, team_name, target_month)
);

-- ------------------------------------------------------------------------------
-- 6. 상담 신청 연동 큐 (dolboni_counsel_requests)
-- 앱에서 [상담 신청]을 누르면 시모니 상담사 홈 화면 카드와 실시간 연동
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dolboni_counsel_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES dolboni_members(id) ON DELETE CASCADE,
    region_id UUID REFERENCES regions(id),                             -- 관할 관서 ID
    station_name VARCHAR(100) NOT NULL,
    contact_phone VARCHAR(50),
    preferred_time VARCHAR(100),
    request_note TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'completed', 'canceled')),
    assigned_counselor_id UUID REFERENCES users(id),                  -- 접수한 상담사
    form_record_id UUID REFERENCES form_records(id),                   -- 연계된 시모니 상담 서식 레코드
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dolboni_requests_status ON dolboni_counsel_requests(region_id, status);

-- ------------------------------------------------------------------------------
-- 7. 원자적 세션 완료 및 일일상한 마일리지 적립 RPC (클 과장 감수)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dolboni_complete_session(
    p_program_type VARCHAR(100),
    p_duration_seconds INT,
    p_pre_valence INT,
    p_pre_arousal INT,
    p_post_valence INT,
    p_post_arousal INT,
    p_work_status VARCHAR(30)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_session_id UUID;
    v_tension_drop INT;
    v_station VARCHAR(100);
    v_center VARCHAR(100);
    v_team VARCHAR(20);
    v_is_active BOOLEAN;
    v_points_to_award INT := 50;           -- 완료 정액 포인트
    v_daily_cap INT := 150;                -- KST 일일 적립 상한
    v_today_earned INT := 0;
    v_actual_points INT := 0;
    v_new_total INT := 0;
    v_kst_today_start TIMESTAMPTZ;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.';
    END IF;

    -- 회원 소속 조회 및 락 (동시성 제어)
    SELECT station_name, center_name, team_name, is_active
    INTO v_station, v_center, v_team, v_is_active
    FROM dolboni_members
    WHERE id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '돌보니 회원이 아닙니다.';
    END IF;

    -- 1. 세션 저장 (당시 소속 스냅샷 포함)
    INSERT INTO dolboni_sessions (
        user_id, program_type, duration_seconds, pre_arousal, post_arousal,
        station_snapshot, center_snapshot, team_snapshot
    ) VALUES (
        v_user_id, p_program_type, p_duration_seconds, p_pre_arousal, p_post_arousal,
        v_station, v_center, v_team
    ) RETURNING id, tension_drop INTO v_session_id, v_tension_drop;

    -- 2. 사전/사후 감정 로그 저장
    INSERT INTO dolboni_mood_logs (user_id, check_type, work_status, valence_score, arousal_score, session_id)
    VALUES 
        (v_user_id, 'pre', p_work_status, p_pre_valence, p_pre_arousal, v_session_id),
        (v_user_id, 'post', p_work_status, p_post_valence, p_post_arousal, v_session_id);

    -- 3. 포인트 적립 (퇴직자 등 비활성 계정은 마일리지 적립 중단, 기록만 허용)
    IF v_is_active THEN
        v_kst_today_start := date_trunc('day', NOW() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul';
        
        SELECT COALESCE(SUM(point_amount), 0)
        INTO v_today_earned
        FROM dolboni_point_ledger
        WHERE user_id = v_user_id
          AND created_at >= v_kst_today_start;

        IF v_today_earned < v_daily_cap THEN
            v_actual_points := LEAST(v_points_to_award, v_daily_cap - v_today_earned);

            INSERT INTO dolboni_point_ledger (user_id, point_amount, reason, session_id)
            VALUES (v_user_id, v_actual_points, '세션 완료 리워드 (' || p_program_type || ')', v_session_id);

            UPDATE dolboni_members
            SET total_points = total_points + v_actual_points,
                updated_at = NOW()
            WHERE id = v_user_id
            RETURNING total_points INTO v_new_total;
        ELSE
            SELECT total_points INTO v_new_total FROM dolboni_members WHERE id = v_user_id;
        END IF;
    ELSE
        SELECT total_points INTO v_new_total FROM dolboni_members WHERE id = v_user_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'session_id', v_session_id,
        'tension_drop', v_tension_drop,
        'awarded_points', v_actual_points,
        'total_points', v_new_total,
        'today_earned', v_today_earned + v_actual_points,
        'daily_cap', v_daily_cap
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. 익명 집계 View (K-익명성 5인 보호)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW team_statistics_view AS
SELECT 
    station_snapshot AS station_name,
    center_snapshot AS center_name,
    team_snapshot AS team_name,
    COUNT(DISTINCT user_id) AS participant_count,
    COUNT(id) AS total_sessions_count,
    COALESCE(SUM(duration_seconds), 0) AS total_duration_seconds,
    ROUND(COALESCE(AVG(duration_seconds), 0), 1) AS avg_duration_seconds,
    -- 5인 미만 소규모 팀은 재식별 방지를 위해 평균 긴장 완화폭 마스킹
    CASE 
        WHEN COUNT(DISTINCT user_id) >= 5 THEN ROUND(AVG(tension_drop), 2)
        ELSE NULL 
    END AS avg_tension_drop
FROM dolboni_sessions
GROUP BY station_snapshot, center_snapshot, team_snapshot;

-- ------------------------------------------------------------------------------
-- 9. Row Level Security (RLS) 정책
-- ------------------------------------------------------------------------------
ALTER TABLE dolboni_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE dolboni_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dolboni_mood_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dolboni_point_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE dolboni_team_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE dolboni_counsel_requests ENABLE ROW LEVEL SECURITY;

-- dolboni_members: 본인 조회 및 프로필 수정
CREATE POLICY p_dolboni_members_select ON dolboni_members
    FOR SELECT TO authenticated
    USING (id = auth.uid());

CREATE POLICY p_dolboni_members_update ON dolboni_members
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- dolboni_sessions / mood_logs / ledger: 본인 열람만 허용
CREATE POLICY p_dolboni_sessions_select ON dolboni_sessions
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY p_dolboni_mood_select ON dolboni_mood_logs
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY p_dolboni_ledger_select ON dolboni_point_ledger
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- dolboni_counsel_requests: 대원 본인은 본인 신청 조회/등록 가능
CREATE POLICY p_dolboni_requests_select ON dolboni_counsel_requests
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR my_role() IN ('super_admin', 'manager', 'counselor'));

CREATE POLICY p_dolboni_requests_insert ON dolboni_counsel_requests
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());
