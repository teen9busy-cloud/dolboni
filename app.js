/**
 * 돌보니(Dolboni) 하이브리드 네이티브 앱 코어 로직 (app.js v5.0 - 동시 오디오 믹싱 완결판)
 * 1. Web Audio API 동시 믹싱 (Single AudioContext):
 *    - 성우 목소리와 배경음(BGM)이 끊김 없이 완벽하게 동시 재생 (Simultaneous Mixing)
 *    - 성우 음성 재생 시 배경음이 은은하게 줄어들었다가 다시 올라오는 오토 덕킹(Auto-Ducking) 적용
 * 2. 한층 더 따뜻하고 부드러워진 명상 호흡 전문 성우 음성 (선희 내레이션 2.0)
 * 3. 5대 사운드(시냇물, 빗소리, 새소리, 명상음악, 무음) 호흡 중 실시간 전환
 * 4. 모바일 원스크린 고정 레이아웃 (버튼 크기 불변)
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
  audioCtx: null,
  bgmGain: null,
  voiceGain: null,
  bgmSource: null,
  audioBuffers: {},         // 디코딩된 오디오 버퍼 캐시
  isLoadingAudio: false,
};

// 2. 초기화 및 모바일 제스처 언락
document.addEventListener('DOMContentLoaded', () => {
  updateHeaderPoints(AppState.user.totalPoints);
  renderTeamStatusMockCard();

  // 첫 터치 시 AudioContext 활성화 및 핵심 음성/사운드 즉시 프리로드
  const unlockAndPreload = () => {
    initAudioEngine();
    preloadAudio();
  };
  document.addEventListener('touchstart', unlockAndPreload, { once: true });
  document.addEventListener('click', unlockAndPreload, { once: true });
});

// 3. Web Audio 믹싱 엔진 초기화
function initAudioEngine() {
  if (AppState.audioCtx) {
    if (AppState.audioCtx.state === 'suspended') AppState.audioCtx.resume();
    return;
  }
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    AppState.audioCtx = new AudioCtx();

    // 배경음 볼륨 노드 (기본 0.45)
    AppState.bgmGain = AppState.audioCtx.createGain();
    AppState.bgmGain.gain.setValueAtTime(0.45, AppState.audioCtx.currentTime);
    AppState.bgmGain.connect(AppState.audioCtx.destination);

    // 음성 볼륨 노드 (기본 1.0 - 또렷하게)
    AppState.voiceGain = AppState.audioCtx.createGain();
    AppState.voiceGain.gain.setValueAtTime(1.0, AppState.audioCtx.currentTime);
    AppState.voiceGain.connect(AppState.audioCtx.destination);

    if (AppState.audioCtx.state === 'suspended') {
      AppState.audioCtx.resume();
    }
  } catch (err) {
    console.warn('AudioEngine init error:', err);
  }
}

// 오디오 파일 비동기 로드 및 디코딩
async function loadAudioBuffer(url) {
  if (AppState.audioBuffers[url]) return AppState.audioBuffers[url];
  try {
    initAudioEngine();
    const resp = await fetch(url);
    const arrayBuffer = await resp.arrayBuffer();
    const audioBuffer = await AppState.audioCtx.decodeAudioData(arrayBuffer);
    AppState.audioBuffers[url] = audioBuffer;
    return audioBuffer;
  } catch (err) {
    console.warn('Load audio buffer error:', url, err);
    return null;
  }
}

// 핵심 음성 및 기본 BGM 사전 로드
function preloadAudio() {
  initAudioEngine();
  const preloadList = [
    'audio/voice_intro.mp3',
    'audio/voice_inhale.mp3',
    'audio/voice_hold.mp3',
    'audio/voice_exhale.mp3',
    'audio/voice_complete.mp3',
    'audio/bgm_stream.ogg',
    'audio/bgm_rain.ogg',
  ];
  preloadList.forEach(url => loadAudioBuffer(url));
}

// ------------------------------------------------------------------------------
// 4. 따뜻한 명상 성우 음성 재생 (BGM과 동시 출력 + 부드러운 오토 덕킹)
// ------------------------------------------------------------------------------
async function playVoice(filename) {
  if (!AppState.voiceEnabled) return;
  initAudioEngine();
  if (!AppState.audioCtx) return;

  try {
    const url = `audio/${filename}`;
    const buffer = await loadAudioBuffer(url);
    if (!buffer) return;

    // 성우 목소리가 나올 때 BGM 볼륨을 살짝 낮춰주는 오토 덕킹 (0.45 -> 0.2)
    if (AppState.bgmGain && AppState.currentBgm !== 'mute') {
      const now = AppState.audioCtx.currentTime;
      AppState.bgmGain.gain.cancelScheduledValues(now);
      AppState.bgmGain.gain.linearRampToValueAtTime(0.2, now + 0.3);
      // 음성 종료 후 다시 BGM 볼륨 회복 (0.2 -> 0.45)
      AppState.bgmGain.gain.linearRampToValueAtTime(0.45, now + buffer.duration + 0.5);
    }

    const source = AppState.audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(AppState.voiceGain);
    source.start(0);
  } catch (err) {
    console.warn('PlayVoice error:', err);
  }
}

function toggleVoiceGuidance() {
  initAudioEngine();
  AppState.voiceEnabled = !AppState.voiceEnabled;

  const btn = document.getElementById('btn-voice-toggle');
  const icon = document.getElementById('voice-icon');
  const title = document.getElementById('voice-title');

  if (AppState.voiceEnabled) {
    btn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/60 text-emerald-300 font-extrabold text-xs';
    icon.textContent = '🗣️';
    title.textContent = '성우 음성 ON';

    playVoice('voice_intro.mp3');
  } else {
    btn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 font-bold text-xs';
    icon.textContent = '🔇';
    title.textContent = '성우 음성 OFF';
  }
}

// ------------------------------------------------------------------------------
// 5. 5대 사운드스케이프 (시냇물 / 빗소리 / 새소리 / 명상음악 / 무음) 루프 재생
// ------------------------------------------------------------------------------
const BGM_FILES = {
  stream: 'audio/bgm_stream.ogg',
  rain: 'audio/bgm_rain.ogg',
  birds: 'audio/bgm_birds.ogg',
  music: 'audio/bgm_music.mp3',
};

const BGM_NAMES = {
  stream: '🌊 시냇물 소리',
  rain: '🌧️ 빗소리',
  birds: '🌲 새소리',
  music: '🎵 명상음악',
  mute: '🔇 무음',
};

function selectBgm(type, btn) {
  initAudioEngine();
  AppState.currentBgm = type;

  // 버튼 스타일 업데이트 (크기 변형 없음)
  document.querySelectorAll('.bgm-btn').forEach(b => {
    b.className = 'bgm-btn py-2 px-1 rounded-xl border border-slate-800 bg-slate-800/80 text-slate-300 flex flex-col items-center';
  });

  if (type === 'mute') {
    btn.className = 'bgm-btn py-2 px-1 rounded-xl border-2 border-rose-500/80 bg-rose-500/20 text-rose-300 flex flex-col items-center';
    document.getElementById('now-playing-label').textContent = '🔇 무음';
    stopBgm();
  } else {
    btn.className = 'bgm-btn py-2 px-1 rounded-xl border-2 border-amber-500 bg-amber-500/20 text-amber-300 flex flex-col items-center';
    document.getElementById('now-playing-label').textContent = BGM_NAMES[type] || '';
    
    // 호흡 중이든 대기 중이든 즉시 새 BGM으로 실시간 전환
    startBgm(type);
  }
}

async function startBgm(type) {
  if (!BGM_FILES[type] || type === 'mute') {
    stopBgm();
    return;
  }
  initAudioEngine();
  if (!AppState.audioCtx) return;

  stopBgm();

  try {
    const url = BGM_FILES[type];
    const buffer = await loadAudioBuffer(url);
    if (!buffer) return;

    AppState.bgmSource = AppState.audioCtx.createBufferSource();
    AppState.bgmSource.buffer = buffer;
    AppState.bgmSource.loop = true;
    AppState.bgmSource.connect(AppState.bgmGain);
    AppState.bgmSource.start(0);
  } catch (err) {
    console.warn('StartBgm error:', err);
  }
}

function stopBgm() {
  if (AppState.bgmSource) {
    try {
      AppState.bgmSource.stop();
      AppState.bgmSource.disconnect();
    } catch (e) {}
    AppState.bgmSource = null;
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
  initAudioEngine();
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

  // 배경음 재생 (무음이 아닌 경우)
  if (AppState.currentBgm !== 'mute') {
    startBgm(AppState.currentBgm);
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

  // 차분한 음성으로 완료 안내
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
  title.textContent = '코로 천천히 숨을 들이마십니다 (4초)';
  phase.textContent = '들숨';
  timer.textContent = '4';
  circle.style.transform = 'scale(1.35)';
  glow.style.transform = 'scale(1.3)';
  
  // 성우 음성 출력 (BGM과 동시 재생!)
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
          title.textContent = '입으로 편안하게 내쉽니다 (8초)';
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
    b.className = 'work-status-btn px-2.5 py-1 rounded-lg border border-slate-800 bg-slate-800/80 text-slate-400 font-bold';
  });
  btn.className = 'work-status-btn px-2.5 py-1 rounded-lg border border-blue-500 bg-blue-600/30 text-blue-200 font-bold';
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
    flex items-center gap-3 px-4 py-3 bg-slate-900 border border-emerald-500/60 text-white
    rounded-2xl shadow-2xl backdrop-blur-md
  `;

  const dropText = drop > 0 ? ` (긴장도 ${drop}점 완화!)` : '';

  toast.innerHTML = `
    <div class="w-8 h-8 rounded-full bg-emerald-500/25 text-emerald-400 flex items-center justify-center font-black text-sm">
      ✓
    </div>
    <div>
      <p class="font-black text-xs text-emerald-300">
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

// 11. 탭 전환
function switchTab(tabId) {
  document.querySelectorAll('main > section').forEach(sec => sec.classList.add('hidden'));
  document.getElementById(`tab-${tabId}`).classList.remove('hidden');

  document.querySelectorAll('.tab-btn').forEach((btn, idx) => {
    const tabs = ['shelter', 'records', 'counsel', 'profile'];
    if (tabs[idx] === tabId) {
      btn.className = 'tab-btn flex flex-col items-center gap-0.5 text-blue-400';
    } else {
      btn.className = 'tab-btn flex flex-col items-center gap-0.5 text-slate-400';
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
    <div class="p-4 rounded-2xl bg-slate-900 border border-slate-700/60 shadow-lg text-white">
      <div class="flex items-center justify-between mb-2.5">
        <div class="flex items-center gap-1.5">
          <span class="p-1 rounded-lg bg-blue-500/20 text-blue-400">🤝</span>
          <h3 class="font-extrabold text-xs tracking-tight">우리 센터/팀 함께 돌보기 현황</h3>
        </div>
        <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold border border-slate-700">
          상대센터 1팀
        </span>
      </div>

      <div class="space-y-2">
        <div class="flex items-baseline justify-between text-xs">
          <span class="text-slate-400 text-[11px]">이번 달 누적 회복 시간</span>
          <span class="text-sm font-black text-blue-400">
            8시간 20분 
            <span class="text-[10px] font-normal text-slate-400">/ 10시간</span>
          </span>
        </div>

        <div>
          <div class="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-700/50">
            <div class="bg-gradient-to-r from-blue-500 to-indigo-500 h-2.5 rounded-full" style="width: 83.3%"></div>
          </div>
          <div class="flex justify-between items-center mt-1.5 text-[10px] text-slate-400 font-medium">
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
