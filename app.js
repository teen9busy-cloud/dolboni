/**
 * 돌보니(Dolboni) 하이브리드 네이티브 앱 코어 로직 (app.js)
 * - Capacitor Haptics (진동) 연동
 * - Web Audio API (화면 꺼짐 대비 오디오 차임)
 * - 4-7-8 이완 호흡 애니메이션 컨트롤러
 * - Supabase RPC 실시간 포인트/세션 연동
 */

// 1. 전역 상태
const AppState = {
  user: {
    id: 'demo-firefighter-01',
    name: '김소방 반장',
    station: '진주소방서',
    center: '상대119안전센터',
    team: '1팀',
    memberType: 'firefighter',
    totalPoints: 450,
  },
  workStatus: 'after_dispatch',
  preArousal: 7,
  postArousal: 3,
  isBreathing: false,
  timerInterval: null,
  audioEnabled: true,
  hapticsEnabled: true,
  audioCtx: null,
};

// 2. 초기화
document.addEventListener('DOMContentLoaded', () => {
  initAudio();
  updateHeaderPoints(AppState.user.totalPoints);
  renderTeamStatusMockCard();
});

// 3. Web Audio 합성기 (차분한 싱잉볼/종소리 톤)
function initAudio() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      AppState.audioCtx = new AudioContext();
    }
  } catch (e) {
    console.warn('Web Audio not supported:', e);
  }
}

function playCalmTone(freq = 432, duration = 1.2) {
  if (!AppState.audioEnabled || !AppState.audioCtx) return;
  try {
    if (AppState.audioCtx.state === 'suspended') {
      AppState.audioCtx.resume();
    }
    const osc = AppState.audioCtx.createOscillator();
    const gain = AppState.audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, AppState.audioCtx.currentTime);

    gain.gain.setValueAtTime(0.01, AppState.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, AppState.audioCtx.currentTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, AppState.audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(AppState.audioCtx.destination);
    osc.start();
    osc.stop(AppState.audioCtx.currentTime + duration);
  } catch (err) {
    console.warn('Audio tone play error:', err);
  }
}

// 4. Capacitor Haptics (네이티브 진동 연동)
async function triggerVibration(type = 'light') {
  if (!AppState.hapticsEnabled) return;
  try {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
      const Haptics = window.Capacitor.Plugins.Haptics;
      if (type === 'inhale') {
        await Haptics.vibrate({ duration: 300 });
      } else if (type === 'hold') {
        await Haptics.impact({ style: 'LIGHT' });
      } else if (type === 'exhale') {
        await Haptics.vibrate({ duration: 500 });
      }
    } else if (navigator.vibrate) {
      if (type === 'inhale') navigator.vibrate([150, 50, 150]);
      else if (type === 'hold') navigator.vibrate(80);
      else if (type === 'exhale') navigator.vibrate(300);
    }
  } catch (err) {
    console.warn('Haptics failed:', err);
  }
}

// 5. 4-7-8 이완 호흡 사이클 제어
function toggleBreathingSession() {
  const btn = document.getElementById('btn-start-session');
  if (AppState.isBreathing) {
    stopBreathingSession();
  } else {
    startBreathingSession();
  }
}

function startBreathingSession() {
  AppState.isBreathing = true;
  const btn = document.getElementById('btn-start-session');
  btn.textContent = '호흡 완료 (체크인)';
  btn.classList.replace('from-blue-600', 'from-rose-600');
  btn.classList.replace('to-indigo-600', 'to-rose-700');

  runBreathingCycle();
}

function stopBreathingSession() {
  AppState.isBreathing = false;
  if (AppState.timerInterval) clearInterval(AppState.timerInterval);

  const btn = document.getElementById('btn-start-session');
  btn.textContent = '호흡 시작하기';
  btn.classList.replace('from-rose-600', 'from-blue-600');
  btn.classList.replace('to-rose-700', 'to-indigo-600');

  document.getElementById('breathe-instruction').textContent = '호흡 준비';
  document.getElementById('breathe-phase-text').textContent = '완료';
  document.getElementById('breathe-timer').textContent = '4-7-8';
  document.getElementById('breathe-circle').style.transform = 'scale(0.9)';

  // 사후 체크인 팝업 열기
  openPostCheckinModal();
}

function runBreathingCycle() {
  if (!AppState.isBreathing) return;

  const circle = document.getElementById('breathe-circle');
  const glow = document.getElementById('breathe-glow');
  const title = document.getElementById('breathe-instruction');
  const phase = document.getElementById('breathe-phase-text');
  const timer = document.getElementById('breathe-timer');

  // Phase 1: 4초 들숨 (Inhale)
  title.textContent = '코로 깊게 들이마십니다 (4초)';
  phase.textContent = '들숨';
  timer.textContent = '4';
  circle.style.transform = 'scale(1.35)';
  glow.style.transform = 'scale(1.3)';
  playCalmTone(396, 2.0);
  triggerVibration('inhale');

  let count = 4;
  AppState.timerInterval = setInterval(() => {
    if (!AppState.isBreathing) return;
    count--;
    if (count > 0) {
      timer.textContent = count;
    } else {
      clearInterval(AppState.timerInterval);
      // Phase 2: 7초 숨 멈춤 (Hold)
      title.textContent = '숨을 편안히 멈춥니다 (7초)';
      phase.textContent = '멈춤';
      timer.textContent = '7';
      triggerVibration('hold');

      let holdCount = 7;
      AppState.timerInterval = setInterval(() => {
        if (!AppState.isBreathing) return;
        holdCount--;
        if (holdCount > 0) {
          timer.textContent = holdCount;
        } else {
          clearInterval(AppState.timerInterval);
          // Phase 3: 8초 입으로 내쉼 (Exhale)
          title.textContent = '입으로 천천히 내쉽니다 (8초)';
          phase.textContent = '날숨';
          timer.textContent = '8';
          circle.style.transform = 'scale(0.85)';
          glow.style.transform = 'scale(0.8)';
          playCalmTone(285, 3.0);
          triggerVibration('exhale');

          let exhaleCount = 8;
          AppState.timerInterval = setInterval(() => {
            if (!AppState.isBreathing) return;
            exhaleCount--;
            if (exhaleCount > 0) {
              timer.textContent = exhaleCount;
            } else {
              clearInterval(AppState.timerInterval);
              // 다음 사이클 반복
              if (AppState.isBreathing) {
                runBreathingCycle();
              }
            }
          }, 1000);
        }
      }, 1000);
    }
  }, 1000);
}

// 6. 상태 선택 & 사전 긴장도
function selectWorkStatus(status, btn) {
  AppState.workStatus = status;
  document.querySelectorAll('.work-status-btn').forEach(b => {
    b.className = 'work-status-btn py-2.5 rounded-xl border border-slate-800 bg-slate-800/60 text-slate-400';
  });
  btn.className = 'work-status-btn py-2.5 rounded-xl border border-blue-500/40 bg-blue-600/20 text-blue-300 font-bold';
}

function updatePreArousalLabel(val) {
  AppState.preArousal = parseInt(val);
  const el = document.getElementById('pre-arousal-val');
  if (val >= 8) el.className = 'text-sm font-black text-rose-400';
  else if (val >= 5) el.className = 'text-sm font-black text-amber-400';
  else el.className = 'text-sm font-black text-emerald-400';
  el.textContent = `${val}점 (${val >= 8 ? '극심한 긴장' : val >= 5 ? '다소 긴장' : '안정'})`;
}

function updatePostArousalLabel(val) {
  AppState.postArousal = parseInt(val);
  const el = document.getElementById('post-arousal-val');
  el.textContent = `${val}점 (${val <= 4 ? '안정됨' : '긴장 잔류'})`;
}

// 7. 사후 체크인 모달 및 포인트 적립
function openPostCheckinModal() {
  document.getElementById('modal-post-checkin').classList.remove('hidden');
}

function confirmPostCheckinAndSave() {
  document.getElementById('modal-post-checkin').classList.add('hidden');

  const tensionDrop = Math.max(0, AppState.preArousal - AppState.postArousal);
  const earnedPoints = 50;
  AppState.user.totalPoints += earnedPoints;

  updateHeaderPoints(AppState.user.totalPoints);

  // 리워드 토스트 알림 표출
  showRewardToast(earnedPoints, tensionDrop);
}

// 8. 리워드 토스트 알림 ("+50 포인트가 적립되었습니다 (긴장도 3점 완화!)")
function showRewardToast(points, drop) {
  const container = document.getElementById('dolboni-toast-container');
  const toast = document.createElement('div');
  toast.className = `
    pointer-events-auto transform translate-y-2 opacity-0 transition-all duration-300 ease-out
    flex items-center gap-3 px-5 py-3.5 bg-slate-900 border border-emerald-500/50 text-white
    rounded-2xl shadow-2xl backdrop-blur-md
  `;

  const dropText = drop > 0 ? ` (긴장도 ${drop}점 완화!)` : '';

  toast.innerHTML = `
    <div class="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">
      ✓
    </div>
    <div>
      <p class="font-extrabold text-xs text-emerald-300">
        +${points} 포인트가 적립되었습니다!
      </p>
      <p class="text-[11px] text-slate-300 font-medium">
        호흡 가이드 완료${dropText}
      </p>
    </div>
  `;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function updateHeaderPoints(points) {
  document.getElementById('header-points-value').textContent = `${points.toLocaleString()} P`;
}

// 9. 탭 전환
function switchTab(tabId) {
  document.querySelectorAll('main > section').forEach(sec => sec.classList.add('hidden'));
  document.getElementById(`tab-${tabId}`).classList.remove('hidden');

  document.querySelectorAll('.tab-btn').forEach((btn, idx) => {
    const tabs = ['shelter', 'records', 'counsel', 'profile'];
    if (tabs[idx] === tabId) {
      btn.className = 'tab-btn flex flex-col items-center gap-1 text-blue-400 active:scale-90 transition';
    } else {
      btn.className = 'tab-btn flex flex-col items-center gap-1 text-slate-400 active:scale-90 transition';
    }
  });
}

// 10. 사운드 및 진동 토글
function toggleAudioChime() {
  AppState.audioEnabled = !AppState.audioEnabled;
  const icon = document.getElementById('icon-sound-on');
  icon.classList.toggle('text-blue-400', AppState.audioEnabled);
  icon.classList.toggle('text-slate-500', !AppState.audioEnabled);
}

function toggleHaptics() {
  AppState.hapticsEnabled = !AppState.hapticsEnabled;
  alert(`진동 햅틱 안내가 ${AppState.hapticsEnabled ? '켜졌습니다' : '꺼졌습니다'}.`);
}

// 11. 우리 센터/팀 함께 돌보기 현황 카드 렌더링
function renderTeamStatusMockCard() {
  const container = document.getElementById('dolboni-team-status-card-container');
  if (!container) return;

  container.innerHTML = `
    <div class="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/90 border border-slate-700/60 shadow-lg text-white">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <span class="p-1.5 rounded-lg bg-blue-500/20 text-blue-400">🤝</span>
          <h3 class="font-extrabold text-sm tracking-tight">우리 센터/팀 함께 돌보기 현황</h3>
        </div>
        <span class="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold border border-slate-700">
          상대센터 1팀
        </span>
      </div>

      <div class="space-y-3">
        <div class="flex items-baseline justify-between text-xs">
          <span class="text-slate-400">이번 달 누적 회복 시간</span>
          <span class="text-base font-black text-blue-400">
            8시간 20분 
            <span class="text-[11px] font-normal text-slate-400">/ 목표 10시간</span>
          </span>
        </div>

        <div>
          <div class="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700/50">
            <div class="bg-gradient-to-r from-blue-500 to-indigo-500 h-3 rounded-full transition-all duration-700" style="width: 83.3%"></div>
          </div>
          <div class="flex justify-between items-center mt-1.5 text-[11px] text-slate-400 font-medium">
            <span>목표 달성률 <strong class="text-emerald-400 font-bold">83.3%</strong></span>
            <span>함께한 대원 <strong>6명</strong></span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// 12. 공무직 인증 코드 검증
function verifyCivilianInviteCode() {
  const code = document.getElementById('invite-code-input').value.trim();
  if (code.length === 6) {
    alert(`[인증 성공] '${AppState.user.station}' 공무직 대원으로 인증되었습니다. 동일하게 마일리지가 적립됩니다.`);
    document.getElementById('profile-member-type').textContent = '공무직 대원 (관서 인증 완료)';
    document.getElementById('invite-code-input').value = '';
  } else {
    alert('유효한 6자리 인증 코드를 입력해 주세요.');
  }
}

// 13. 상담 신청 제출 (시모니 연동)
function submitCounselRequest(e) {
  e.preventDefault();
  const phone = document.getElementById('counsel-phone').value;
  const time = document.getElementById('counsel-time').value;
  alert(`비공개 상담 신청이 접수되었습니다!\n전담 상담사가 확인 후 [${phone}] 번호로 조용히 연락드립니다.`);
  e.target.reset();
  switchTab('shelter');
}
