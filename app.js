/**
 * 돌보니 (Dolboni) PWA 코어 엔진 (app.js v7.0 - 온보딩 게이트·영구기억·비회원 이관 완성판)
 * 
 * 1. 4-4-6 공명 호흡 엔진 (들숨 4초, 멈춤 4초, 날숨 6초, 총 14초 분당 4.3회 호흡)
 * 2. 웰컴 온보딩 게이트 (소방관 인증 vs 비회원 체험) & 브라우저 영구 기억
 * 3. 비회원 긴장도 측정 & 로컬 보관 ➜ 소방관 인증 시 시모니 일괄 이관 파이프라인
 * 4. 사용시간 및 빈도 기반 마일리지 엔진 (비회원 체험 마일리지 분리, 일일상한 200P)
 * 5. 스마트 바탕화면 아이콘 추가(A2HS) - 골든타임(첫 호흡 완료 시) 유도
 * 6. 클린 데이터 리셋 (초기 포인트 0P, 세션 0회)
 */

// ------------------------------------------------------------------------------
// 1. Supabase 클라이언트 설정 (시모니 1.0 운영 DB 연동)
// ------------------------------------------------------------------------------
const SUPABASE_URL = 'https://jrpbdhhnyyjsuohnvapu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpycGJkaGhueXlqc3VvaG52YXB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAwMDAwMDAsImV4cCI6MjA1NTAwMDAwMH0.placeholder';
let sbClient = null;
try {
  if (window.supabase) {
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.warn('[Dolboni] Supabase init warning:', e);
}

// ------------------------------------------------------------------------------
// 2. 전역 상태 (AppState) - 클린 리셋 초기값
// ------------------------------------------------------------------------------
const AppState = {
  user: {
    id: 'guest',
    name: '게스트 대원',
    phone: '',
    headquarters: '경남소방본부',
    station: '비회원 모드',
    center: '소방관 미인증',
    team: '1팀',
    memberType: 'firefighter',
    totalPoints: 0,        // 공식 적립 마일리지 (클린 0P)
    isVerified: false,     // 인증 여부
    clientId: null,
  },
  guestPoints: 0,          // 비회원 임시 체험 포인트
  workStatus: 'after_dispatch',
  preArousal: 7,
  postArousal: 3,
  isBreathing: false,
  timerInterval: null,
  sessionStartTime: null,
  lastSessionDuration: 0,
  voiceEnabled: true,
  currentBgm: 'music',
  hapticsEnabled: true,
  audioCtx: null,
  bgmGain: null,
  voiceGain: null,
  bgmSource: null,
  voiceSource: null,
  audioBuffers: {},
  deferredPrompt: null,
  totalSessionsCount: 0,
  totalHealingMinutes: 0,
};

// ------------------------------------------------------------------------------
// 3. 앱 초기화 (DOM 준비 시)
// ------------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // 기존 레거시 테스트 데이터 완전 제거
  clearLegacyTestData();

  loadUserFromStorage();
  loadStatsFromStorage();
  updateHeaderUI();
  renderTeamStatusCard();
  initA2hsSystem();

  // 최초 1회 웰컴 온보딩 게이트 확인
  checkWelcomeGate();

  // 음원 네트워크 사전 캐시
  try {
    fetch('audio/bgm_music.mp3').catch(() => {});
    fetch('audio/voice_inhale.mp3').catch(() => {});
    fetch('audio/voice_hold.mp3').catch(() => {});
    fetch('audio/voice_exhale.mp3').catch(() => {});
  } catch(e) {}

  // 최초 사용자 터치 시 Web Audio 엔진 언락
  const unlockAudio = () => {
    initAudioEngine();
    preloadAudio();
  };
  document.addEventListener('touchstart', unlockAudio, { once: true });
  document.addEventListener('click', unlockAudio, { once: true });
});

// ------------------------------------------------------------------------------
// 4. 레거시 테스트 데이터 정리 및 초기화
// ------------------------------------------------------------------------------
function clearLegacyTestData() {
  const isMigrated = localStorage.getItem('dolboni_clean_v7');
  if (!isMigrated) {
    // 이전 버전의 목업/테스트 데이터 완전 제거
    localStorage.removeItem('dolboni_user');
    localStorage.removeItem('dolboni_user_v6');
    localStorage.removeItem('dolboni_stat_sessions');
    localStorage.removeItem('dolboni_stat_minutes');
    localStorage.removeItem('dolboni_points');
    localStorage.setItem('dolboni_clean_v7', 'true');
  }
}

// ------------------------------------------------------------------------------
// 5. 웰컴 온보딩 게이트 (최초 1회 선택 & 영구 기억)
// ------------------------------------------------------------------------------
function checkWelcomeGate() {
  const chosenMode = localStorage.getItem('dolboni_mode_v7');
  const gateModal = document.getElementById('modal-welcome-gate');
  if (!chosenMode && gateModal) {
    gateModal.classList.remove('hidden');
  }
}

function chooseVerifiedOnboarding() {
  const gateModal = document.getElementById('modal-welcome-gate');
  if (gateModal) gateModal.classList.add('hidden');
  openAuthModal();
}

function chooseGuestOnboarding() {
  const gateModal = document.getElementById('modal-welcome-gate');
  if (gateModal) gateModal.classList.add('hidden');
  
  localStorage.setItem('dolboni_mode_v7', 'guest');
  AppState.user.isVerified = false;
  AppState.user.name = '게스트 대원';
  AppState.user.station = '비회원 쉼터';
  AppState.user.center = '소방관 미인증';
  saveUserToStorage();
  updateHeaderUI();
}

// ------------------------------------------------------------------------------
// 6. Web Audio 믹싱 엔진 (BGM + 성우 동시 재생)
// ------------------------------------------------------------------------------
function initAudioEngine() {
  if (AppState.audioCtx) {
    if (AppState.audioCtx.state === 'suspended') AppState.audioCtx.resume();
    return;
  }
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    AppState.audioCtx = new AudioCtx();

    // 배경음 볼륨 (0.50)
    AppState.bgmGain = AppState.audioCtx.createGain();
    AppState.bgmGain.gain.setValueAtTime(0.50, AppState.audioCtx.currentTime);
    AppState.bgmGain.connect(AppState.audioCtx.destination);

    // 음성 볼륨 (1.0)
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

function preloadAudio() {
  const preloadList = [
    'audio/voice_inhale.mp3',
    'audio/voice_hold.mp3',
    'audio/voice_exhale.mp3',
    'audio/voice_complete.mp3',
    'audio/bgm_music.mp3',
  ];
  preloadList.forEach(url => loadAudioBuffer(url));
}

function stopVoice() {
  if (AppState.voiceSource) {
    try {
      AppState.voiceSource.stop();
      AppState.voiceSource.disconnect();
    } catch (e) {}
    AppState.voiceSource = null;
  }
}

async function playVoice(filename) {
  if (!AppState.voiceEnabled) return;
  initAudioEngine();
  stopVoice();

  if (!AppState.isBreathing && filename !== 'voice_complete.mp3') return;

  const buffer = await loadAudioBuffer(`audio/${filename}`);
  if (!buffer || !AppState.audioCtx) return;

  const source = AppState.audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(AppState.voiceGain);
  source.onended = () => {
    if (AppState.voiceSource === source) AppState.voiceSource = null;
  };
  source.start(0);
  AppState.voiceSource = source;
}

async function playBgm(type) {
  AppState.currentBgm = type;
  if (AppState.bgmSource) {
    try {
      AppState.bgmSource.stop();
      AppState.bgmSource.disconnect();
    } catch (e) {}
    AppState.bgmSource = null;
  }

  if (type === 'mute') return;

  initAudioEngine();
  const fileMap = {
    music: 'audio/bgm_music.mp3',
    rain: 'audio/bgm_rain.mp3',
    birds: 'audio/bgm_birds.mp3',
    stream: 'audio/bgm_stream.mp3',
  };
  const url = fileMap[type];
  if (!url) return;

  const buffer = await loadAudioBuffer(url);
  if (!buffer || !AppState.audioCtx) return;

  const source = AppState.audioCtx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(AppState.bgmGain);
  source.start(0);
  AppState.bgmSource = source;
}

function selectBgm(type, btn) {
  document.querySelectorAll('.bgm-btn').forEach(b => {
    b.className = 'bgm-btn py-2 px-1 rounded-xl border border-slate-800 bg-slate-800/80 text-slate-400 flex flex-col items-center';
  });
  btn.className = 'bgm-btn py-2 px-1 rounded-xl border-2 border-amber-500 bg-amber-500/20 text-amber-300 flex flex-col items-center';

  const labelMap = {
    music: '🎵 명상음악',
    rain: '🌧️ 빗소리',
    birds: '🌲 새소리',
    stream: '🌊 시냇물',
    mute: '🔇 무음',
  };
  document.getElementById('now-playing-label').textContent = labelMap[type] || '';
  playBgm(type);
}

function toggleVoiceGuidance() {
  AppState.voiceEnabled = !AppState.voiceEnabled;
  const btn = document.getElementById('btn-voice-toggle');
  const title = document.getElementById('voice-title');
  if (AppState.voiceEnabled) {
    btn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/60 text-emerald-300 font-extrabold text-xs';
    title.textContent = '성우 음성 ON';
  } else {
    stopVoice();
    btn.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 font-extrabold text-xs';
    title.textContent = '성우 음성 OFF';
  }
}

// ------------------------------------------------------------------------------
// 7. 4-4-6 공명 호흡 리듬 엔진 (들숨 4초, 멈춤 4초, 날숨 6초)
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
  AppState.sessionStartTime = Date.now();
  const btn = document.getElementById('btn-start-session');
  btn.textContent = '호흡 완료 (체크인)';
  btn.classList.replace('from-blue-600', 'from-rose-600');
  btn.classList.replace('to-indigo-600', 'to-rose-700');

  if (!AppState.bgmSource && AppState.currentBgm !== 'mute') {
    playBgm(AppState.currentBgm);
  }

  runBreathingCycle();
}

function stopBreathingSession() {
  AppState.isBreathing = false;
  if (AppState.timerInterval) clearInterval(AppState.timerInterval);
  stopVoice();

  if (AppState.sessionStartTime) {
    AppState.lastSessionDuration = Math.max(1, Math.round((Date.now() - AppState.sessionStartTime) / 1000));
  }

  const btn = document.getElementById('btn-start-session');
  btn.textContent = '호흡 시작하기';
  btn.classList.replace('from-rose-600', 'from-blue-600');
  btn.classList.replace('to-rose-700', 'to-indigo-600');

  const circle = document.getElementById('breathe-circle');
  circle.style.transition = 'transform 0.8s ease-out';
  circle.style.transform = 'scale(0.9)';

  document.getElementById('breathe-instruction').textContent = '호흡 준비';
  document.getElementById('breathe-phase-text').textContent = '완료';
  document.getElementById('breathe-timer').textContent = '4-4-6';

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
  
  circle.style.transition = 'transform 4s cubic-bezier(0.4, 0, 0.2, 1)';
  glow.style.transition = 'transform 4s ease-out';
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

      // Phase 2: 4초 숨 멈춤 (Hold)
      title.textContent = '숨을 편안히 멈춥니다 (4초)';
      phase.textContent = '멈춤';
      timer.textContent = '4';

      circle.style.transition = 'transform 1s ease-in-out';
      circle.style.transform = 'scale(1.35)';
      glow.style.transform = 'scale(1.2)';

      playVoice('voice_hold.mp3');
      triggerVibration('hold');

      let holdCount = 4;
      AppState.timerInterval = setInterval(() => {
        if (!AppState.isBreathing) return;
        holdCount--;
        if (holdCount > 0) {
          timer.textContent = holdCount;
        } else {
          clearInterval(AppState.timerInterval);

          // Phase 3: 6초 입으로 내쉼 (Exhale)
          title.textContent = '입으로 편안하게 내쉽니다 (6초)';
          phase.textContent = '날숨';
          timer.textContent = '6';

          circle.style.transition = 'transform 6s cubic-bezier(0.4, 0, 0.2, 1)';
          glow.style.transition = 'transform 6s ease-out';
          circle.style.transform = 'scale(0.85)';
          glow.style.transform = 'scale(0.8)';

          playVoice('voice_exhale.mp3');
          triggerVibration('exhale');

          let exhaleCount = 6;
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

function triggerVibration(type) {
  if (!AppState.hapticsEnabled || !navigator.vibrate) return;
  try {
    if (type === 'inhale') navigator.vibrate([160, 50, 160]);
    else if (type === 'hold') navigator.vibrate(80);
    else if (type === 'exhale') navigator.vibrate(350);
  } catch (e) {}
}

// ------------------------------------------------------------------------------
// 8. 사용시간 & 긴장도 측정 및 마일리지 산정 (회원/비회원 분기)
// ------------------------------------------------------------------------------
function selectWorkStatus(status, btn) {
  AppState.workStatus = status;
  document.querySelectorAll('.work-status-btn').forEach(b => {
    b.className = 'work-status-btn px-2.5 py-1 rounded-lg border border-slate-800 bg-slate-800/80 text-slate-400 font-bold';
  });
  btn.className = 'work-status-btn px-2.5 py-1 rounded-lg border border-blue-500 bg-blue-600/30 text-blue-200 font-bold';
}

function updatePostArousalLabel(val) {
  AppState.postArousal = parseInt(val);
  const el = document.getElementById('post-arousal-val');
  el.textContent = `${val}점 (${val <= 4 ? '안정됨' : val <= 7 ? '보통' : '긴장 잔류'})`;
}

function openPostCheckinModal() {
  document.getElementById('modal-post-checkin').classList.remove('hidden');
}

function confirmPostCheckinAndSave() {
  document.getElementById('modal-post-checkin').classList.add('hidden');

  const duration = AppState.lastSessionDuration || 60;
  const tensionDrop = Math.max(0, AppState.preArousal - AppState.postArousal);

  // 마일리지 계산 (기본 50P + 1분 초과당 10P + 긴장완화 2점 이상 20P)
  let earnedPoints = 50;
  if (duration > 60) {
    const extraMinutes = Math.min(4, Math.floor((duration - 60) / 60));
    earnedPoints += extraMinutes * 10;
  }
  if (tensionDrop >= 2) {
    earnedPoints += 20;
  }

  // 1. 비회원(게스트)인 경우:
  if (!AppState.user.isVerified) {
    // 공식 마일리지는 적립하지 않고, '임시 체험 포인트'로 로컬 누적
    AppState.guestPoints += earnedPoints;
    AppState.totalSessionsCount += 1;
    AppState.totalHealingMinutes += Math.round(duration / 60);

    // 비회원 긴장도 시계열 데이터 로컬 배열에 안전 보관 (인증 시 일괄 이관용)
    const guestSessions = JSON.parse(localStorage.getItem('dolboni_guest_sessions_v7') || '[]');
    guestSessions.push({
      program_type: '4-4-6 공명 호흡',
      duration_seconds: duration,
      pre_arousal: AppState.preArousal,
      post_arousal: AppState.postArousal,
      tension_drop: tensionDrop,
      earned_points: earnedPoints,
      work_status: AppState.workStatus,
      created_at: new Date().toISOString()
    });
    localStorage.setItem('dolboni_guest_sessions_v7', JSON.stringify(guestSessions));
    localStorage.setItem('dolboni_guest_points_v7', AppState.guestPoints.toString());

    saveStatsToStorage();
    updateHeaderUI();
    showGuestRewardToast(earnedPoints, tensionDrop, duration, AppState.guestPoints);

    // 첫 세션 완료 골든타임: A2HS 설치 제안
    suggestA2hsAfterSession();
    return;
  }

  // 2. 정식 소방관 인증 회원인 경우:
  const todayKey = `dolboni_points_${new Date().toISOString().slice(0, 10)}`;
  const todayEarned = parseInt(localStorage.getItem(todayKey) || '0');
  if (todayEarned + earnedPoints > 200) {
    earnedPoints = Math.max(0, 200 - todayEarned);
  }
  localStorage.setItem(todayKey, (todayEarned + earnedPoints).toString());

  AppState.user.totalPoints += earnedPoints;
  AppState.totalSessionsCount += 1;
  AppState.totalHealingMinutes += Math.round(duration / 60);

  saveStatsToStorage();
  saveUserToStorage();
  updateHeaderUI();
  showRewardToast(earnedPoints, tensionDrop, duration);

  // Supabase 원격 DB 실시간 전송
  syncSessionToSupabase(duration, AppState.preArousal, AppState.postArousal, tensionDrop, earnedPoints);

  // 세션 완료 골든타임: A2HS 설치 제안
  suggestA2hsAfterSession();
}

async function syncSessionToSupabase(duration, pre, post, drop, points) {
  if (!sbClient) return;
  try {
    const payload = {
      user_id: AppState.user.clientId || AppState.user.id,
      program_type: '4-4-6 공명 호흡',
      duration_seconds: duration,
      pre_arousal: pre,
      post_arousal: post,
      station_snapshot: AppState.user.station,
      center_snapshot: AppState.user.center,
      team_snapshot: AppState.user.team,
      work_status: AppState.workStatus,
      created_at: new Date().toISOString()
    };
    await sbClient.from('dolboni_sessions').insert(payload);
  } catch (err) {
    console.warn('[Dolboni] Supabase sync deferred:', err);
  }
}

// ------------------------------------------------------------------------------
// 9. 리워드 토스트 알림
// ------------------------------------------------------------------------------
function showRewardToast(points, drop, duration) {
  const container = document.getElementById('dolboni-toast-container');
  const toast = document.createElement('div');
  toast.className = 'pointer-events-auto transform translate-y-2 opacity-0 transition-all duration-300 ease-out flex items-center gap-3 px-4 py-3 bg-slate-900 border border-emerald-500/60 text-white rounded-2xl shadow-2xl backdrop-blur-md';

  const dropText = drop > 0 ? ` (긴장도 ${drop}점 완화!)` : '';
  const minText = Math.floor(duration / 60) > 0 ? `${Math.floor(duration / 60)}분 ` : '';
  const secText = `${duration % 60}초 호흡`;

  toast.innerHTML = `
    <div class="w-8 h-8 rounded-full bg-emerald-500/25 text-emerald-400 flex items-center justify-center font-black text-sm">✓</div>
    <div>
      <p class="font-black text-xs text-emerald-300">+${points} 마일리지가 적립되었습니다!</p>
      <p class="text-[11px] text-slate-300 font-medium">${minText}${secText} 완료${dropText}</p>
    </div>
  `;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.remove('translate-y-2', 'opacity-0'));
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function showGuestRewardToast(points, drop, duration, totalGuest) {
  const container = document.getElementById('dolboni-toast-container');
  const toast = document.createElement('div');
  toast.className = 'pointer-events-auto transform translate-y-2 opacity-0 transition-all duration-300 ease-out flex items-center gap-3 px-4 py-3 bg-slate-900 border border-blue-500/60 text-white rounded-2xl shadow-2xl backdrop-blur-md cursor-pointer';
  toast.onclick = () => openAuthModal();

  const dropText = drop > 0 ? ` (긴장도 ${drop}점 완화!)` : '';

  toast.innerHTML = `
    <div class="w-8 h-8 rounded-full bg-blue-500/25 text-blue-400 flex items-center justify-center font-black text-sm">✨</div>
    <div>
      <p class="font-black text-xs text-blue-300">4-4-6 호흡을 마쳤습니다!${dropText}</p>
      <p class="text-[10px] text-slate-300 mt-0.5">
        👉 <strong>소방관 인증하기</strong>를 누르면 누적 <strong>${totalGuest}P</strong>가 관서 마일리지로 즉시 전환됩니다!
      </p>
    </div>
  `;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.remove('translate-y-2', 'opacity-0'));
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// ------------------------------------------------------------------------------
// 10. 스마트 바탕화면 아이콘 추가 (A2HS) 시스템
// ------------------------------------------------------------------------------
function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches 
      || window.navigator.standalone === true;
}

function updateIosGuideContent() {
  const isKakao = /KAKAOTALK/i.test(navigator.userAgent);
  const isChrome = /CriOS/i.test(navigator.userAgent);
  const titleEl = document.getElementById('ios-guide-title');
  const subEl = document.getElementById('ios-guide-sub');
  const bodyEl = document.getElementById('ios-guide-body');
  if (!bodyEl) return;

  if (isKakao) {
    if (titleEl) titleEl.textContent = '카카오톡 브라우저 감지';
    if (subEl) subEl.textContent = '카카오톡 내부에서는 홈 화면 추가가 차단되어 있습니다';
    bodyEl.innerHTML = `
      <div class="flex items-center gap-2.5 text-amber-300 font-bold mb-1">
        <span>⚠️ 사파리(Safari) 또는 크롬으로 열기 필요</span>
      </div>
      <div class="flex items-center gap-2.5">
        <span class="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">1</span>
        <span>화면 우측 상단 또는 하단의 <strong>[더보기 ···]</strong>를 누릅니다.</span>
      </div>
      <div class="flex items-center gap-2.5">
        <span class="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">2</span>
        <span>메뉴에서 <strong>[Safari로 열기]</strong> 또는 <strong>[기본 브라우저로 열기]</strong>를 선택합니다.</span>
      </div>
      <div class="flex items-center gap-2.5">
        <span class="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">3</span>
        <span>열린 사파리/크롬에서 <strong>[공유 ⎋] ➜ [홈 화면에 추가]</strong>를 누르면 설치 완료!</span>
      </div>
    `;
  } else if (isChrome) {
    if (titleEl) titleEl.textContent = '아이폰 크롬(Chrome)에서 홈 화면 추가';
    if (subEl) subEl.textContent = '크롬 브라우저에서 3초 만에 바탕화면 아이콘을 생성합니다';
    bodyEl.innerHTML = `
      <div class="flex items-center gap-2.5">
        <span class="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">1</span>
        <span>주소창 우측 상단(또는 우측 하단 ···)의 <strong>[공유 버튼 ⎋]</strong>을 누릅니다.</span>
      </div>
      <div class="flex items-center gap-2.5">
        <span class="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">2</span>
        <span>공유 메뉴 목록을 올려 <strong>[홈 화면에 추가 ⊞]</strong>를 누릅니다.</span>
      </div>
      <div class="flex items-center gap-2.5">
        <span class="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">3</span>
        <span>우측 상단의 <strong>[추가]</strong>를 누르면 바탕화면에 설치 완료!</span>
      </div>
    `;
  } else {
    if (titleEl) titleEl.textContent = '아이폰 사파리(Safari)에서 홈 화면 추가';
    if (subEl) subEl.textContent = '사파리에서 홈 화면에 추가하면 전체화면 앱으로 열립니다';
    bodyEl.innerHTML = `
      <div class="flex items-center gap-2.5">
        <span class="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">1</span>
        <span>화면 하단 중앙의 <strong>[공유 버튼 ⎋]</strong>을 누릅니다.</span>
      </div>
      <div class="flex items-center gap-2.5">
        <span class="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">2</span>
        <span>메뉴를 올려 <strong>[홈 화면에 추가 ⊞]</strong>를 누릅니다.</span>
      </div>
      <div class="flex items-center gap-2.5">
        <span class="w-6 h-6 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">3</span>
        <span>우측 상단의 <strong>[추가]</strong>를 누르면 바탕화면에 설치 완료!</span>
      </div>
    `;
  }
}

function initA2hsSystem() {
  if (isStandaloneMode()) {
    const headerBtn = document.getElementById('btn-header-install');
    if (headerBtn) headerBtn.classList.add('hidden');
    return;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    AppState.deferredPrompt = e;
  });

  window.addEventListener('appinstalled', () => {
    AppState.deferredPrompt = null;
    dismissInstallBanner();
    alert('돌보니 앱이 홈 화면에 성공적으로 설치되었습니다!');
  });
}

function suggestA2hsAfterSession() {
  if (isStandaloneMode()) return;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIOS) {
    const dismissedTime = localStorage.getItem('dolboni_a2hs_ios_dismissed');
    if (!dismissedTime || (Date.now() - parseInt(dismissedTime)) > 86400000) {
      setTimeout(() => {
        updateIosGuideContent();
        const modal = document.getElementById('ios-install-modal');
        if (modal) modal.classList.remove('hidden');
      }, 1000);
    }
  } else if (AppState.deferredPrompt) {
    const banner = document.getElementById('android-install-banner');
    if (banner) banner.classList.remove('hidden');
  }
}

function triggerAndroidInstall() {
  if (AppState.deferredPrompt) {
    AppState.deferredPrompt.prompt();
    AppState.deferredPrompt.userChoice.then((choice) => {
      if (choice.outcome === 'accepted') {
        dismissInstallBanner();
      }
      AppState.deferredPrompt = null;
    });
  } else {
    alert('📱 안드로이드: 브라우저 메뉴(⋮) ➜ [홈 화면에 추가] 또는 [앱 설치]를 누르시면 바탕화면에 앱 아이콘이 바로 생성됩니다.');
  }
}

function dismissInstallBanner() {
  const banner = document.getElementById('android-install-banner');
  if (banner) banner.classList.add('hidden');
}

function closeIosInstallModal() {
  const modal = document.getElementById('ios-install-modal');
  if (modal) modal.classList.add('hidden');
}

function dismissIosInstallModal24h() {
  localStorage.setItem('dolboni_a2hs_ios_dismissed', Date.now().toString());
  closeIosInstallModal();
}

function openA2hsGuide() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIOS) {
    updateIosGuideContent();
    const modal = document.getElementById('ios-install-modal');
    if (modal) modal.classList.remove('hidden');
  } else if (AppState.deferredPrompt) {
    triggerAndroidInstall();
  } else {
    alert('📱 안드로이드: 브라우저 메뉴(⋮) ➜ [홈 화면에 추가] 또는 [앱 설치]를 누르시면 바탕화면에 앱 아이콘이 바로 생성됩니다.');
  }
}

// ------------------------------------------------------------------------------
// 11. 사용자 상태 보존 & 비회원 ➜ 소방관 인증 일괄 이관 파이프라인
// ------------------------------------------------------------------------------
function loadUserFromStorage() {
  const saved = localStorage.getItem('dolboni_user_v7');
  if (saved) {
    try {
      AppState.user = { ...AppState.user, ...JSON.parse(saved) };
    } catch (e) {}
  }
  AppState.guestPoints = parseInt(localStorage.getItem('dolboni_guest_points_v7') || '0');
}

function saveUserToStorage() {
  localStorage.setItem('dolboni_user_v7', JSON.stringify(AppState.user));
}

function loadStatsFromStorage() {
  AppState.totalSessionsCount = parseInt(localStorage.getItem('dolboni_stat_sessions_v7') || '0');
  AppState.totalHealingMinutes = parseInt(localStorage.getItem('dolboni_stat_minutes_v7') || '0');
}

function saveStatsToStorage() {
  localStorage.setItem('dolboni_stat_sessions_v7', AppState.totalSessionsCount.toString());
  localStorage.setItem('dolboni_stat_minutes_v7', AppState.totalHealingMinutes.toString());
}

function updateHeaderUI() {
  const pointsVal = document.getElementById('header-points-value');
  const textEl = document.getElementById('user-affiliation-text');

  if (AppState.user.isVerified) {
    pointsVal.textContent = `${AppState.user.totalPoints.toLocaleString()} P`;
    textEl.textContent = `${AppState.user.name} (${AppState.user.station} ${AppState.user.team})`;
  } else {
    pointsVal.textContent = AppState.guestPoints > 0 ? `체험 ${AppState.guestPoints} P` : '0 P';
    textEl.textContent = '게스트 모드 (소방관 인증하기 ➜)';
  }

  // 프로필 탭 동기화
  const pName = document.getElementById('profile-name');
  if (pName) pName.textContent = AppState.user.name;
  const pType = document.getElementById('profile-member-type');
  if (pType) pType.textContent = AppState.user.isVerified ? '소방공무원 (인증 완료)' : '비회원 게스트 (미인증)';
  const pStation = document.getElementById('profile-station');
  if (pStation) pStation.textContent = AppState.user.station;
  const pCenterTeam = document.getElementById('profile-center-team');
  if (pCenterTeam) pCenterTeam.textContent = `${AppState.user.center} ${AppState.user.team}`;

  // 통계 탭
  const sSessions = document.getElementById('stat-total-sessions');
  if (sSessions) sSessions.textContent = `${AppState.totalSessionsCount}회`;
  const sMinutes = document.getElementById('stat-total-minutes');
  if (sMinutes) sMinutes.textContent = `${AppState.totalHealingMinutes}분`;
}

function openAuthModal() {
  const modal = document.getElementById('modal-auth-profile');
  if (!modal) return;
  document.getElementById('auth-name').value = AppState.user.isVerified ? AppState.user.name : '';
  document.getElementById('auth-phone').value = AppState.user.phone || '';
  document.getElementById('auth-station').value = AppState.user.station !== '비회원 모드' && AppState.user.station !== '비회원 쉼터' ? AppState.user.station : '';
  document.getElementById('auth-center').value = AppState.user.center !== '소방관 미인증' ? AppState.user.center : '';
  document.getElementById('auth-team').value = AppState.user.team || '1팀';
  modal.classList.remove('hidden');
}

function closeAuthModal() {
  const modal = document.getElementById('modal-auth-profile');
  if (modal) modal.classList.add('hidden');
}

async function handleUserAuthSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('auth-name').value.trim();
  const phone = document.getElementById('auth-phone').value.trim();
  const hq = document.getElementById('auth-headquarters').value;
  const station = document.getElementById('auth-station').value.trim();
  const center = document.getElementById('auth-center').value.trim();
  const team = document.getElementById('auth-team').value;
  const memberType = document.querySelector('input[name="auth-member-type"]:checked').value;

  AppState.user.name = name;
  AppState.user.phone = phone;
  AppState.user.headquarters = hq;
  AppState.user.station = station;
  AppState.user.center = center;
  AppState.user.team = team;
  AppState.user.memberType = memberType;
  AppState.user.isVerified = true;

  localStorage.setItem('dolboni_mode_v7', 'verified');

  // Supabase clients 매칭 시도
  let matched = false;
  if (sbClient) {
    try {
      const { data, error } = await sbClient
        .from('clients')
        .select('id, name')
        .ilike('name', name)
        .limit(1);

      if (data && data.length > 0) {
        AppState.user.clientId = data[0].id;
        matched = true;
      }
    } catch (err) {
      console.warn('Supabase matching error:', err);
    }
  }

  // ★ 비회원으로 누적된 긴장도 시계열 데이터 및 마일리지 일괄 이관 파이프라인
  const guestSessions = JSON.parse(localStorage.getItem('dolboni_guest_sessions_v7') || '[]');
  const migratedCount = guestSessions.length;
  let migratedPoints = AppState.guestPoints;

  if (migratedCount > 0) {
    AppState.user.totalPoints += migratedPoints;
    AppState.guestPoints = 0;
    localStorage.removeItem('dolboni_guest_points_v7');
    localStorage.removeItem('dolboni_guest_sessions_v7');

    // 비동기 Supabase 일괄 전송
    if (sbClient) {
      guestSessions.forEach(sess => {
        syncSessionToSupabase(sess.duration_seconds, sess.pre_arousal, sess.post_arousal, sess.tension_drop, sess.earned_points);
      });
    }
  }

  saveUserToStorage();
  updateHeaderUI();
  closeAuthModal();

  if (matched) {
    if (migratedCount > 0) {
      alert(`[소방관 인증 및 데이터 연동 완료]\n${name} 대원님, 시모니 1.0 등록 정보와 100% 매칭되었습니다!\n\n비회원으로 기록했던 [${migratedCount}회 호흡 이력]과 [${migratedPoints}P 마일리지]가 ${station} 소속으로 공식 이관되었습니다!`);
    } else {
      alert(`[소방관 인증 완료]\n${name} 대원님, 시모니 1.0 등록 정보와 100% 매칭되었습니다.\n지금부터 모든 쉼터 마일리지가 실시간 연동됩니다.`);
    }
  } else {
    if (migratedCount > 0) {
      alert(`[신규 대원 등록 및 데이터 보존]\n${name} 대원님, ${station} 소속으로 신규 등록되었습니다!\n\n비회원 시절의 [${migratedCount}회 호흡 이력]과 [${migratedPoints}P 마일리지]가 안전하게 보존 연계되었습니다.`);
    } else {
      alert(`[신규 대원 등록 완료]\n${name} 대원님, 소속(${station})으로 등록되었습니다.\n시모니 심리지원 대기열에 승인 요청되었으며, 마일리지는 지금부터 정상 적립됩니다!`);
    }
  }
}

// ------------------------------------------------------------------------------
// 12. 탭 전환 및 상담 신청
// ------------------------------------------------------------------------------
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

function renderTeamStatusCard() {
  const container = document.getElementById('dolboni-team-status-card-container');
  if (!container) return;

  const station = AppState.user.station !== '비회원 모드' && AppState.user.station !== '비회원 쉼터' ? AppState.user.station : '경남소방본부';
  const centerTeam = AppState.user.center !== '소방관 미인증' ? `${AppState.user.center} ${AppState.user.team}` : '힐링 쉼터';

  container.innerHTML = `
    <div class="p-4 rounded-2xl bg-slate-900 border border-slate-700/60 shadow-lg text-white">
      <div class="flex items-center justify-between mb-2.5">
        <div class="flex items-center gap-1.5">
          <span class="p-1 rounded-lg bg-blue-500/20 text-blue-400">🤝</span>
          <h3 class="font-extrabold text-xs tracking-tight">우리 관서/팀 함께 돌보기 현황</h3>
        </div>
        <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold border border-slate-700">
          ${centerTeam}
        </span>
      </div>

      <div class="space-y-2">
        <div class="flex items-baseline justify-between text-xs">
          <span class="text-slate-400 text-[11px]">${station} 이번 달 누적</span>
          <span class="text-sm font-black text-blue-400">
            8시간 20분 
            <span class="text-[10px] font-normal text-slate-400">/ 10시간 목표</span>
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

function submitCounselRequest(e) {
  e.preventDefault();
  const phone = document.getElementById('counsel-phone').value;
  alert(`비공개 상담 신청이 접수되었습니다!\n소속 관서 전담 상담사가 확인 후 [${phone}] 번호로 조용히 연락드립니다.`);
  e.target.reset();
  switchTab('shelter');
}
