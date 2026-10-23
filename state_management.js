/**
 * 돌보니 (Dolboni) 앱 상태 관리 및 UI 연동 모듈 (state_management.js)
 * 작성: 안 대리 (총괄/조율) & 코 사원 (스니펫/UI 로직)
 * 감수: 클 과장 (보안/정합성)
 */

export class DolboniStateManager {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.state = {
      user: null,
      profile: null,
      totalPoints: 0,
      teamStatus: {
        stationName: '',
        centerName: '',
        teamName: '',
        totalDurationSeconds: 0,
        goalDurationSeconds: 36000,
        achievementRate: 0,
        participantCount: 0,
      },
      isLoading: false,
    };
    this.listeners = new Set();
  }

  // 상태 구독 (UI 컴포넌트 리렌더링 연동)
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach((listener) => listener(this.state));
  }

  // 1. 초기 사용자 프로필 및 보유 포인트 조회
  async initialize() {
    try {
      this.state.isLoading = true;
      this.notify();

      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('사용자 인증 세션이 없습니다.');
      this.state.user = user;

      const { data: profile, error } = await this.supabase
        .from('dolboni_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('프로필 로드 에러:', error);
      }

      if (profile) {
        this.state.profile = profile;
        this.state.totalPoints = profile.total_points || 0;
      }

      await this.fetchTeamStatus();
      this.updateHeaderPointsBadge();
    } catch (err) {
      console.error('Dolboni State Init Error:', err);
    } finally {
      this.state.isLoading = false;
      this.notify();
    }
  }

  // 2. 상단 헤더 마음건강 마일리지 배지 업데이트
  updateHeaderPointsBadge() {
    const badgeEl = document.getElementById('dolboni-header-points-badge');
    if (!badgeEl) return;

    badgeEl.innerHTML = `
      <div class="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full text-amber-400 font-semibold text-sm shadow-sm transition-all hover:scale-105">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
        <span>${this.state.totalPoints.toLocaleString()} P</span>
      </div>
    `;
  }

  // 3. 호흡/명상 세션 완료 및 사후 체크인 RPC 호출
  async completeSessionAndCheckin({
    programType,
    durationSeconds,
    preValence,
    preArousal,
    postValence,
    postArousal,
    workStatus,
  }) {
    try {
      this.state.isLoading = true;
      this.notify();

      // 클 과장 보안 수칙: 클라이언트 직접 쓰기를 막고 원자적 RPC(dolboni_complete_session) 호출
      const { data, error } = await this.supabase.rpc('dolboni_complete_session', {
        p_program_type: programType,
        p_duration_seconds: durationSeconds,
        p_pre_valence: preValence,
        p_pre_arousal: preArousal,
        p_post_valence: postValence,
        p_post_arousal: postArousal,
        p_work_status: workStatus,
      });

      if (error) throw error;

      if (data && data.success) {
        // 포인트 갱신
        this.state.totalPoints = data.total_points;
        this.updateHeaderPointsBadge();

        // 즉각적인 리워드 토스트 알림 트리거
        const tensionDrop = data.tension_drop;
        const awardedPoints = data.awarded_points;
        this.showRewardToast({
          points: awardedPoints,
          tensionDrop: tensionDrop,
        });

        // 팀 회복 통계 새로고침
        await this.fetchTeamStatus();
        this.renderTeamStatusCard();
      }

      return data;
    } catch (err) {
      console.error('세션 완료 저장 실패:', err);
      alert('세션 결과를 저장하지 못했습니다: ' + err.message);
    } finally {
      this.state.isLoading = false;
      this.notify();
    }
  }

  // 4. 즉각적인 리워드 토스트 알림 표시 ("+50 포인트가 적립되었습니다 (긴장도 3점 완화!)")
  showRewardToast({ points, tensionDrop }) {
    let container = document.getElementById('dolboni-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'dolboni-toast-container';
      container.className = 'fixed top-6 right-6 z-50 flex flex-col gap-2 pointer-events-none';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `
      pointer-events-auto transform translate-y-2 opacity-0 transition-all duration-300 ease-out
      flex items-center gap-3 px-5 py-3.5 bg-slate-900/95 border border-emerald-500/40 text-white
      rounded-xl shadow-2xl backdrop-blur-md
    `;

    const dropText = tensionDrop > 0 
      ? ` (긴장도 ${tensionDrop}점 완화!)` 
      : tensionDrop === 0 ? ' (긴장도 안정 유지)' : '';

    toast.innerHTML = `
      <div class="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
        ✓
      </div>
      <div>
        <p class="font-bold text-sm text-emerald-300">
          +${points} 포인트가 적립되었습니다!
        </p>
        <p class="text-xs text-slate-300 font-medium">
          호흡 가이드 완료${dropText}
        </p>
      </div>
    `;

    container.appendChild(toast);

    // 애니메이션 진입
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    });

    // 4초 후 자동 소멸
    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // 5. '우리 센터/팀 함께 돌보기 현황' 데이터 조회 (RPC)
  async fetchTeamStatus() {
    try {
      const { data, error } = await this.supabase.rpc('dolboni_get_my_team_status');
      if (error) throw error;

      if (data && data.station_name) {
        this.state.teamStatus = {
          stationName: data.station_name,
          centerName: data.center_name,
          teamName: data.team_name,
          totalDurationSeconds: data.total_duration_seconds || 0,
          goalDurationSeconds: data.goal_duration_seconds || 36000,
          achievementRate: data.achievement_rate || 0,
          participantCount: data.participant_count || 0,
        };
      }
    } catch (err) {
      console.warn('팀 현황 조회 실패 (프로필 미등록 등):', err);
    }
  }

  // 6. '나의 회복 기록' 탭 하단 '우리 센터/팀 함께 돌보기 현황' 카드 렌더링
  renderTeamStatusCard(targetContainerId = 'dolboni-team-status-card-container') {
    const container = document.getElementById(targetContainerId);
    if (!container) return;

    const {
      stationName,
      centerName,
      teamName,
      totalDurationSeconds,
      goalDurationSeconds,
      achievementRate,
      participantCount,
    } = this.state.teamStatus;

    const hours = Math.floor(totalDurationSeconds / 3600);
    const minutes = Math.floor((totalDurationSeconds % 3600) / 60);
    const goalHours = Math.round(goalDurationSeconds / 3600);

    container.innerHTML = `
      <div class="mt-6 p-5 rounded-2xl bg-gradient-to-br from-slate-800/90 to-slate-900/90 border border-slate-700/60 shadow-lg text-white">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="p-1.5 rounded-lg bg-blue-500/20 text-blue-400">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </span>
            <h3 class="font-bold text-base tracking-tight">우리 센터/팀 함께 돌보기 현황</h3>
          </div>
          <span class="text-xs px-2.5 py-0.5 rounded-full bg-slate-700 text-slate-300 font-medium">
            ${centerName || stationName || '소속 팀'} ${teamName || ''}
          </span>
        </div>

        <div class="space-y-3">
          <div class="flex items-baseline justify-between text-sm">
            <span class="text-slate-400">이번 달 누적 회복 시간</span>
            <span class="text-lg font-extrabold text-blue-400">
              ${hours}시간 ${minutes}분 
              <span class="text-xs font-normal text-slate-400">/ 목표 ${goalHours}시간</span>
            </span>
          </div>

          <!-- 목표 달성률 프로그레스 바 -->
          <div>
            <div class="w-full bg-slate-700/50 rounded-full h-3 overflow-hidden border border-slate-600/30">
              <div 
                class="bg-gradient-to-r from-blue-500 to-indigo-500 h-3 rounded-full transition-all duration-700 ease-out" 
                style="width: ${Math.min(achievementRate, 100)}%"
              ></div>
            </div>
            <div class="flex justify-between items-center mt-1.5 text-xs text-slate-400 font-medium">
              <span>목표 달성률 <strong class="text-emerald-400">${achievementRate}%</strong></span>
              <span>함께한 대원 <strong>${participantCount}명</strong></span>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
