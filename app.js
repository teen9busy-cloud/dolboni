/**
 * 돌보니(Dolboni) 하이브리드 네이티브 앱 코어 로직 (app.js v4.0)
 * 1. 따뜻하고 자연스러운 실제 명상 성우 음성 안내 (고음질 MP3)
 * 2. 실제 자연의 소리 4종 (시냇물 소리, 빗소리, 새소리, 명상음악) 루프 재생
 * 3. 호흡 중 실시간 배경음 전환 (끊김 없는 즉각 교체)
 * 4. 터치 시 버튼 크기 변형 완전 방지 (고정 크기 유지)
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
  voiceEnabled: true,       // 음성 안내 활성화
  currentBgm: 'stream',     // 'stream' | 'rain' | 'birds' | 'music' | 'mute'
  hapticsEnabled: true,
  bgmAudio: null,           // 배경음 Audio 엘리먼트
  voiceAudio: null,         // 성우 음성 Audio 엘리먼트
};

// 2. 초기화
document.addEventListener('DOMContentLoaded', () => {
  initAudioPlayers();
  updateHeaderPoints(AppState.user.totalPoints);
  renderTeamStatusMockCard();

  // 모바일 오디오 잠금 해제 (첫 터치 시)
  const unlock = () => {
    if (AppState.bgmAudio) {
      AppState.bgmAudio.load();
    }
    if (AppState.voiceAudio) {
      AppState.voiceAudio.load();
    }
  };
  document.addEventListener('touchstart', unlock, { once: true });
  document.addEventListener('click', unlock, { once: true });
});

// 3. 고음질 오디오 플레이어 초기화
function initAudioPlayers() {
  AppState.bgmAudio = new Audio();
  AppState.bgmAudio.loop = true;
  AppState.bgmAudio.volume = 0.85;

  AppState.voiceAudio = new Audio();
  AppState.voiceAudio.volume = 1.0;
}

// ------------------------------------------------------------------------------
// 4. 따뜻한 실제 성우 음성 안내 (선희 내레이션 MP3)
// ------------------------------------------------------------------------------
function playVoice(filename) {
  if (!AppState.voiceEnabled) return;
  try {
    if (!AppState.voiceAudio) initAudioPlayers();
    AppState.voiceAudio.pause();
    AppState.voiceAudio.currentTime = 0;
    AppState.voiceAudio.src = `audio/${filename}`;
    const p = AppState.voiceAudio.play();
    if (p && p.catch) p.catch(e => console.warn('Voice play deferred:', e));
  } catch (err) {
    console.warn('Voice error:', err);
  }
}

function toggleVoiceGuidance() {
  AppState.voiceEnabled = !AppState.voiceEnabled;

  const btn = document.getElementById('btn-voice-toggle');
  const icon = document.getElementById('voice-icon');
  const title = document.getElementById('voice-title');
  const badge = document.getElementById('voice-badge');

  if (AppState.voiceEnabled) {
    btn.className = 'w-full h-14 px-4 rounded-2xl flex items-center justify-between bg-emerald-500/20 border-2 border-emerald-500 text-emerald-300 font-black text-sm shadow-sm';
    icon.textContent = '🗣️';
    title.textContent = '부드러운 음성 안내 켜짐';
    badge.className = 'px-3 py-1 rounded-full bg-emerald-500 text-slate-950 font-black text-xs';
    badge.textContent = 'ON';

    playVoice('voice_intro.mp3');
  } else {
    btn.className = 'w-full h-14 px-4 rounded-2xl flex items-center justify-between bg-slate-800/80 border border-slate-700 text-slate-400 font-bold text-sm shadow-sm';
    icon.textContent = '🔇';
    title.textContent = '음성 안내 꺼짐';
    badge.className = 'px-3 py-1 rounded-full bg-slate-700 text-slate-400 font-bold text-xs';
    badge.textContent = 'OFF';

    if (AppState.voiceAudio) AppState.voiceAudio.pause();
  }
}

// ------------------------------------------------------------------------------
// 5. 실제 자연의 소리 4종 (시냇물 / 빗소리 / 새소리 / 명상음악)
// ------------------------------------------------------------------------------
const BGM_FILES = {
  stream: 'bgm_stream.ogg',
  rain: 'bgm_rain.ogg',
  birds: 'bgm_birds.ogg',
  music: 'bgm_music.mp3',
};

const BGM_NAMES = {
  stream: '🌊 시냇물 소리 재생 중',
  rain: '🌧️ 빗소리 재생 중',
  birds: '🌲 새소리 재생 중',
  music: '🎵 명상음악 재생 중',
  mute: '🔇 무음',
};

function selectBgm(type, btn) {
  AppState.currentBgm = type;

  // 카드 스타일 초기화 (크기 변형 없음)
  document.querySelectorAll('.bgm-card').forEach(b => {
    b.className = 'bgm-card h-14 px-3 rounded-2xl border border-slate-800 bg-slate-800/80 text-slate-300 flex items-center gap-2.5 shadow-sm';
  });

  if (type === 'mute') {
    btn.className = 'bgm-card mt-2 w-full h-11 rounded-xl border-2 border-rose-500/60 bg-rose-500/20 text-rose-300 text-xs font-bold flex items-center justify-center gap-1.5';
    document.getElementById('now-playing-label').textContent = '🔇 무음';
    stopBgm();
  } else {
    btn.className = 'bgm-card h-14 px-3 rounded-2xl border-2 border-amber-500 bg-amber-500/20 text-amber-300 flex items-center gap-2.5 shadow-sm';
    document.getElementById('now-playing-label').textContent = BGM_NAMES[type] || '';
    
    // 호흡 중이거나 미리듣기일 때 즉각 재생
    playBgm(type);
  }
}

function playBgm(type) {
  if (!BGM_FILES[type] || type === 'mute') {
    stopBgm();
    return;
  }

  try {
    if (!AppState.bgmAudio) initAudioPlayers();
    AppState.bgmAudio.src = `audio/${BGM_FILES[type]}`;
    AppState.bgmAudio.currentTime = 0;
    const p = AppState.bgmAudio.play();
    if (p && p.catch) p.catch(e => console.warn('BGM play deferred:', e));
  } catch (err) {
    console.warn('Play BGM error:', err);
  }
}

function stopBgm() {
  if (AppState.bgmAudio) {
    AppState.bgmAudio.pause();
    AppState.bgmAudio.currentTime = 0;
  }
}

// ------------------------------------------------------------------------------
// 6. Capacitor Haptics (진동)
// ------------------------------------------------------------------------------
async function triggerVibration(type = 'light') {
  if (!AppState.hapticsEnabled) return;
  try {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
      const Haptics = window.Capacitor.Plugins.Haptics;
      if (type === 'inhale') await Haptics.vibrate({ duration: 300 });
      else if (type === 'hold') await Haptics.impact({ style: 'LIGHT' });
      else if (type === 'exhale') await Haptics.vibrate({ duration: 500 });
    } else if (navigator.vibrate) {
      if (type === 'inhale') navigator.vibrate([180, 60, 180]);
      else if (type === 'hold') navigator.vibrate(80);
      else if (type === 'exhale') navigator.vibrate(400);
    }
  } catch (err) {
    console.warn('Haptics failed:', err);
  }
}

// ------------------------------------------------------------------------------
// 7. 4-7-8 이완 호흡 사이클 제어
// ------------------------------------------------------------------------------
function toggleBreathingSession() {
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

  // 배경음 재생 시작
  if (AppState.currentBgm !== 'mute') {
    playBgm(AppState.currentBgm);
  }

  runBreathingCycle();
}

function stopBreathingSession() {
  AppState.isBreathing = false;
  if (AppState.timerInterval) clearInterval(AppState.timerInterval);

  stopBgm();

  const btn = document.getElementById('btn-start-session');
  btn.textContent = '호흡 시작하기';
  btn.classList.replace('from-rose-600', 'from-blue-600');
  btn.classList.replace('to-rose-700', 'to-indigo-600');

  document.getElementById('breathe-instruction').textContent = '호흡 준비';
  document.getElementById('breathe-phase-text').textContent = '완료';
  document.getElementById('breathe-timer').textContent = '4-7-8';
  document.getElementById('breathe-circle').style.transform = 'scale(0.9)';

  // 따뜻한 음성으로 완료 안내
  playVoice('voice_complete.mp3');

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
  
  playVoice('voice_inhale.mp3');
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
      
      playVoice('voice_hold.mp3');
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
          
          playVoice('voice_exhale.mp3');
          triggerVibration('exhale');

          let exhaleCount = 8;
          AppState.timerInterval = setInterval(() => {
            if (!AppState.isBreathing) return;
            exhaleCount--;
            if (exhaleCount > 0) {
              timer.textContent = exhaleCount;
            } else {
              clearInterval(AppState.timerInterval);
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

// ------------------------------------------------------------------------------
// 8. 근무 상황 및 긴장도
// ------------------------------------------------------------------------------
function selectWorkStatus(status, btn) {
  AppState.workStatus = status;
  document.querySelectorAll('.work-status-btn').forEach(b => {
    b.className = 'work-status-btn h-12 rounded-2xl border border-slate-800 bg-slate-800/60 text-slate-400';
  });
  btn.className = 'work-status-btn h-12 rounded-2xl border-2 border-blue-500 bg-blue-600/30 text-blue-200 font-bold';
}

function updatePreArousalLabel(val) {
  AppState.preArousal = parseInt(val);
  const el = document.getElementById('pre-arousal-val');
  if (val >= 8) el.className = 'text-xs font-black text-rose-400';
  else if (val >= 5) el.className = 'text-xs font-black text-amber-400';
  else el.className = 'text-xs font-black text-emerald-400';
  el.textContent = `${val}점 (${val >= 8 ? '극심한 긴장' : val >= 5 ? '다소 긴장' : '안정'})`;
}

function updatePostArousalLabel(val) {
  AppState.postArousal = parseInt(val);
  const el = document.getElementById('post-arousal-val');
  el.textContent = `${val}점 (${val <= 4 ? '안정됨' : '긴장 잔류'})`;
}

// ------------------------------------------------------------------------------
// 9. 사후 체크인 모달 및 포인트 적립
// ------------------------------------------------------------------------------
function openPostCheckinModal() {
  document.getElementById('modal-post-checkin').classList.remove('hidden');
}

function confirmPostCheckinAndSave() {
  document.getElementById('modal-post-checkin').classList.add('hidden');

  const tensionDrop = Math.max(0, AppState.preArousal - AppState.postArousal);
  const earnedPoints = 50;
  AppState.user.totalPoints += earnedPoints;

  updateHeaderPoints(AppState.user.totalPoints);
  showRewardToast(earnedPoints, tensionDrop);
}

// 10. 리워드 토스트 알림
function showRewardToast(points, drop) {
  const container = document.getElementById('dolboni-toast-container');
  const toast = document.createElement('div');
  toast.className = `
    pointer-events-auto transform translate-y-2 opacity-0 transition-all duration-300 ease-out
    flex items-center gap-3 px-5 py-4 bg-slate-900 border border-emerald-500/60 text-white
    rounded-2xl shadow-2xl backdrop-blur-md
  `;

  const dropText = drop > 0 ? ` (긴장도 ${drop}점 완화!)` : '';

  toast.innerHTML = `
    <div class="w-9 h-9 rounded-full bg-emerald-500/25 text-emerald-400 flex items-center justify-center font-black text-base">
      ✓
    </div>
    <div>
      <p class="font-black text-sm text-emerald-300">
        +${points} 포인트가 적립되었습니다!
      </p>
      <p class="text-xs text-slate-300 font-medium mt-0.5">
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

// 11. 탭 전환
function switchTab(tabId) {
  document.querySelectorAll('main > section').forEach(sec => sec.classList.add('hidden'));
  document.getElementById(`tab-${tabId}`).classList.remove('hidden');

  document.querySelectorAll('.tab-btn').forEach((btn, idx) => {
    const tabs = ['shelter', 'records', 'counsel', 'profile'];
    if (tabs[idx] === tabId) {
      btn.className = 'tab-btn flex flex-col items-center gap-1 text-blue-400';
    } else {
      btn.className = 'tab-btn flex flex-col items-center gap-1 text-slate-400';
    }
  });
}

function toggleHaptics() {
  AppState.hapticsEnabled = !AppState.hapticsEnabled;
  alert(`진동 햅틱 안내가 ${AppState.hapticsEnabled ? '켜졌습니다' : '꺼졌습니다'}.`);
}

// 12. 우리 센터/팀 함께 돌보기 현황 카드 렌더링
function renderTeamStatusMockCard() {
  const container = document.getElementById('dolboni-team-status-card-container');
  if (!container) return;

  container.innerHTML = `
    <div class="p-5 rounded-3xl bg-slate-900 border border-slate-700/60 shadow-lg text-white">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <span class="p-2 rounded-xl bg-blue-500/20 text-blue-400">🤝</span>
          <h3 class="font-extrabold text-sm tracking-tight">우리 센터/팀 함께 돌보기 현황</h3>
        </div>
        <span class="text-xs px-3 py-1 rounded-full bg-slate-800 text-slate-300 font-bold border border-slate-700">
          상대센터 1팀
        </span>
      </div>

      <div class="space-y-3">
        <div class="flex items-baseline justify-between text-xs">
          <span class="text-slate-400">이번 달 누적 회복 시간</span>
          <span class="text-base font-black text-blue-400">
            8시간 20분 
            <span class="text-xs font-normal text-slate-400">/ 목표 10시간</span>
          </span>
        </div>

        <div>
          <div class="w-full bg-slate-800 rounded-full h-3.5 overflow-hidden border border-slate-700/50">
            <div class="bg-gradient-to-r from-blue-500 to-indigo-500 h-3.5 rounded-full transition-all duration-700" style="width: 83.3%"></div>
          </div>
          <div class="flex justify-between items-center mt-2 text-xs text-slate-400 font-medium">
            <span>목표 달성률 <strong class="text-emerald-400 font-bold">83.3%</strong></span>
            <span>함께한 대원 <strong>6명</strong></span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// 13. 공무직 인증 코드 검증
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

// 14. 상담 신청 제출 (시모니 연동)
function submitCounselRequest(e) {
  e.preventDefault();
  const phone = document.getElementById('counsel-phone').value;
  alert(`비공개 상담 신청이 접수되었습니다!\n전담 상담사가 확인 후 [${phone}] 번호로 조용히 연락드립니다.`);
  e.target.reset();
  switchTab('shelter');
}
