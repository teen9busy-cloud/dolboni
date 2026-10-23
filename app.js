/**
 * 돌보니(Dolboni) 하이브리드 네이티브 앱 코어 로직 (app.js v3.0 - 사운드/음성/모바일 최적화 완결판)
 * - 모바일 Safari/Chrome 오디오 자동재생 잠금 해제 (Unlock AudioContext)
 * - 스마트폰 스피커에 최적화된 고출력 4대 힐링 사운드
 * - 실시간 배경음 즉시 전환 (호흡 중에도 실시간 변경)
 * - 한국어 음성 안내 (TTS 및 보조 사운드 큐 100% 보장)
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
  currentBgm: 'bowl',       // 'bowl' | 'stream' | 'birds' | 'music' | 'mute'
  hapticsEnabled: true,
  audioCtx: null,
  activeBgNodes: [],        // 활성화된 BGM 오디오 노드 목록
  birdTimer: null,
};

// 2. 초기화 및 모바일 터치 오디오 해제
document.addEventListener('DOMContentLoaded', () => {
  updateHeaderPoints(AppState.user.totalPoints);
  renderTeamStatusMockCard();

  // 스마트폰 터치 제스처 시 AudioContext 및 음성 엔진 즉각 잠금 해제
  const unlockAudio = () => {
    ensureAudioContext();
    // 모바일 SpeechSynthesis 잠금 해제용 빈 발화
    if ('speechSynthesis' in window) {
      try {
        const u = new SpeechSynthesisUtterance('');
        window.speechSynthesis.speak(u);
      } catch (e) {}
    }
  };

  document.addEventListener('touchstart', unlockAudio, { once: true });
  document.addEventListener('click', unlockAudio, { once: true });
});

// 3. AudioContext 초기화 및 스마트폰 오디오 언락
function ensureAudioContext() {
  try {
    if (!AppState.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      AppState.audioCtx = new AudioCtx();
    }
    if (AppState.audioCtx.state === 'suspended') {
      AppState.audioCtx.resume();
    }
  } catch (err) {
    console.warn('AudioContext init error:', err);
  }
}

// ------------------------------------------------------------------------------
// 4. 한국어 음성 안내 (Web Speech API + 보조 사운드 큐)
// ------------------------------------------------------------------------------
function speakVoice(text) {
  if (!AppState.voiceEnabled) return;
  try {
    ensureAudioContext();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 0.85;  // 편안한 속도
      utterance.pitch = 1.0;
      utterance.volume = 1.0; // 스마트폰 스피커 최대 볼륨

      // 한국어 음성 지정 (가능한 경우)
      const voices = window.speechSynthesis.getVoices();
      const koVoice = voices.find(v => v.lang.startsWith('ko'));
      if (koVoice) utterance.voice = koVoice;

      window.speechSynthesis.speak(utterance);
    }
  } catch (err) {
    console.warn('Voice speak error:', err);
  }
}

// 음성 안내 ON/OFF 토글
function toggleVoiceGuidance() {
  ensureAudioContext();
  AppState.voiceEnabled = !AppState.voiceEnabled;

  const btn = document.getElementById('btn-voice-toggle');
  const icon = document.getElementById('voice-icon');
  const title = document.getElementById('voice-title');
  const badge = document.getElementById('voice-badge');

  if (AppState.voiceEnabled) {
    btn.className = 'w-full py-3.5 px-4 rounded-2xl flex items-center justify-between bg-emerald-500/20 border-2 border-emerald-500/50 text-emerald-300 font-black text-sm shadow-sm active:scale-98 transition';
    icon.textContent = '🗣️';
    title.textContent = '한국어 음성 안내 켜짐';
    badge.className = 'px-2.5 py-1 rounded-full bg-emerald-500 text-slate-950 font-black text-xs';
    badge.textContent = 'ON';

    // 켜짐 즉시 음성 및 알림음 송출 (작동 확인용)
    playChimeUp();
    setTimeout(() => {
      speakVoice('음성 안내가 켜졌습니다.');
    }, 200);
  } else {
    btn.className = 'w-full py-3.5 px-4 rounded-2xl flex items-center justify-between bg-slate-800/80 border border-slate-700 text-slate-400 font-bold text-sm shadow-sm active:scale-98 transition';
    icon.textContent = '🔇';
    title.textContent = '한국어 음성 안내 꺼짐';
    badge.className = 'px-2.5 py-1 rounded-full bg-slate-700 text-slate-400 font-bold text-xs';
    badge.textContent = 'OFF';

    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }
}

// ------------------------------------------------------------------------------
// 5. 스마트폰 스피커 전용 4대 힐링 사운드 신시사이저
// ------------------------------------------------------------------------------
function selectBgm(type, btn) {
  ensureAudioContext();
  AppState.currentBgm = type;

  // 전체 카드 스타일 초기화
  document.querySelectorAll('.bgm-card').forEach(b => {
    b.className = 'bgm-card py-3.5 px-3 rounded-2xl border border-slate-800 bg-slate-800/80 text-slate-300 flex items-center gap-2.5 shadow-sm active:scale-95 transition';
  });

  // 선택된 카드 하이라이트
  if (type === 'mute') {
    btn.className = 'bgm-card mt-2 w-full py-2.5 rounded-xl border-2 border-rose-500/60 bg-rose-500/20 text-rose-300 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-98 transition';
    document.getElementById('now-playing-label').textContent = '🔇 무음';
  } else {
    btn.className = 'bgm-card py-3.5 px-3 rounded-2xl border-2 border-amber-500 bg-amber-500/20 text-amber-300 flex items-center gap-2.5 shadow-sm active:scale-95 transition';
    const names = {
      bowl: '🔔 쇠그릇 재생 중',
      stream: '🌊 계곡 물소리 재생 중',
      birds: '🌲 숲속 새소리 재생 중',
      music: '🎵 명상음악 재생 중',
    };
    document.getElementById('now-playing-label').textContent = names[type] || '';
  }

  // 기존 사운드 중지
  stopContinuousBgm();

  // 호흡 진행 중이면 즉시 새 사운드로 라이브 전환, 진행 전이면 2~3초 샘플 재생
  if (AppState.isBreathing) {
    startContinuousBgm();
  } else {
    previewBgm(type);
  }
}

function stopContinuousBgm() {
  if (AppState.birdTimer) clearInterval(AppState.birdTimer);
  AppState.activeBgNodes.forEach(node => {
    try {
      if (node.stop) node.stop();
      if (node.disconnect) node.disconnect();
    } catch (e) {}
  });
  AppState.activeBgNodes = [];
}

function previewBgm(type) {
  ensureAudioContext();
  if (type === 'bowl') {
    playSingingBowl(528, 4.0);
  } else if (type === 'stream') {
    startStreamAudio();
    setTimeout(() => { if (!AppState.isBreathing) stopContinuousBgm(); }, 3000);
  } else if (type === 'birds') {
    playBirdChirp();
    setTimeout(playBirdChirp, 1000);
  } else if (type === 'music') {
    startAmbientPad();
    setTimeout(() => { if (!AppState.isBreathing) stopContinuousBgm(); }, 3500);
  }
}

function startContinuousBgm() {
  ensureAudioContext();
  if (!AppState.audioCtx || AppState.currentBgm === 'mute') return;

  stopContinuousBgm();

  if (AppState.currentBgm === 'stream') {
    startStreamAudio();
  } else if (AppState.currentBgm === 'birds') {
    playBirdChirp();
    AppState.birdTimer = setInterval(() => {
      if (AppState.isBreathing && AppState.currentBgm === 'birds') {
        playBirdChirp();
      }
    }, 3200);
  } else if (AppState.currentBgm === 'music') {
    startAmbientPad();
  } else if (AppState.currentBgm === 'bowl') {
    playSingingBowl(528, 5.0);
  }
}

// [사운드 1] 🔔 쇠그릇 (티베탄 싱잉볼 - 스마트폰에 뚜렷한 528Hz 치유 배음)
function playSingingBowl(baseFreq = 528, duration = 4.5) {
  ensureAudioContext();
  if (!AppState.audioCtx) return;
  try {
    const ctx = AppState.audioCtx;
    const now = ctx.currentTime;
    
    // 스마트폰 스피커에서 풍성하게 울리도록 고역 배음 보강
    const partials = [
      { f: baseFreq, g: 0.6 },          // 528Hz 기본음 (크고 맑음)
      { f: baseFreq * 1.5, g: 0.35 },   // 792Hz
      { f: baseFreq * 2.0, g: 0.25 },   // 1056Hz
      { f: baseFreq * 2.76, g: 0.15 },  // 1457Hz (금속성 배음)
      { f: baseFreq + 2.0, g: 0.3 }     // 맥동 바이노럴 울림
    ];

    partials.forEach(p => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(p.f, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(p.g, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    });
  } catch (err) {
    console.warn('Singing bowl error:', err);
  }
}

// [사운드 2] 🌊 계곡 물소리 (고출력 시냇물)
function startStreamAudio() {
  ensureAudioContext();
  try {
    const ctx = AppState.audioCtx;
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.35;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    // 계곡 물소리 대역통과 필터 (1200Hz ~ 2400Hz 물결)
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, ctx.currentTime);
    filter.Q.setValueAtTime(1.8, ctx.currentTime);

    // 물의 출렁임 LFO
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.setValueAtTime(0.6, ctx.currentTime);
    lfoGain.gain.setValueAtTime(450, ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    const mainGain = ctx.createGain();
    mainGain.gain.setValueAtTime(0.45, ctx.currentTime); // 충분한 볼륨

    noise.connect(filter);
    filter.connect(mainGain);
    mainGain.connect(ctx.destination);

    noise.start();
    lfo.start();

    AppState.activeBgNodes.push(noise, lfo, mainGain, filter);
  } catch (err) {
    console.warn('Stream audio error:', err);
  }
}

// [사운드 3] 🌲 숲속 새소리 (선명한 지저귐)
function playBirdChirp() {
  ensureAudioContext();
  if (!AppState.audioCtx) return;
  try {
    const ctx = AppState.audioCtx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(3200, now);
    osc.frequency.exponentialRampToValueAtTime(4200, now + 0.07);
    osc.frequency.exponentialRampToValueAtTime(2800, now + 0.16);
    osc.frequency.exponentialRampToValueAtTime(3600, now + 0.24);
    osc.frequency.exponentialRampToValueAtTime(2600, now + 0.38);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.42);
  } catch (err) {
    console.warn('Bird chirp error:', err);
  }
}

// [사운드 4] 🎵 432Hz 명상 앰비언트 코드 패드
function startAmbientPad() {
  ensureAudioContext();
  try {
    const ctx = AppState.audioCtx;
    const now = ctx.currentTime;
    const chord = [432, 540, 648, 864]; // 밝고 따뜻한 A 장조 화음

    chord.forEach(freq => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 1.0);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      AppState.activeBgNodes.push(osc, gain);
    });
  } catch (err) {
    console.warn('Ambient pad error:', err);
  }
}

// 보조 효과음 (들숨: 도-미-솔 상승 차임)
function playChimeUp() {
  ensureAudioContext();
  if (!AppState.audioCtx) return;
  const ctx = AppState.audioCtx;
  const now = ctx.currentTime;
  [523.25, 659.25, 783.99].forEach((f, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, now + i * 0.1);
    gain.gain.setValueAtTime(0.001, now + i * 0.1);
    gain.gain.linearRampToValueAtTime(0.25, now + i * 0.1 + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + i * 0.1);
    osc.stop(now + i * 0.1 + 0.65);
  });
}

// 보조 효과음 (날숨: 솔-미-도 하강 이완 차임)
function playChimeDown() {
  ensureAudioContext();
  if (!AppState.audioCtx) return;
  const ctx = AppState.audioCtx;
  const now = ctx.currentTime;
  [783.99, 659.25, 523.25].forEach((f, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, now + i * 0.12);
    gain.gain.setValueAtTime(0.001, now + i * 0.12);
    gain.gain.linearRampToValueAtTime(0.2, now + i * 0.12 + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.7);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + i * 0.12);
    osc.stop(now + i * 0.12 + 0.75);
  });
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
  ensureAudioContext();
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

  // 지속 배경음 시작
  startContinuousBgm();

  runBreathingCycle();
}

function stopBreathingSession() {
  AppState.isBreathing = false;
  if (AppState.timerInterval) clearInterval(AppState.timerInterval);

  stopContinuousBgm();

  const btn = document.getElementById('btn-start-session');
  btn.textContent = '호흡 시작하기';
  btn.classList.replace('from-rose-600', 'from-blue-600');
  btn.classList.replace('to-rose-700', 'to-indigo-600');

  document.getElementById('breathe-instruction').textContent = '호흡 준비';
  document.getElementById('breathe-phase-text').textContent = '완료';
  document.getElementById('breathe-timer').textContent = '4-7-8';
  document.getElementById('breathe-circle').style.transform = 'scale(0.9)';

  // 음성으로 완료 안내
  speakVoice('수고하셨습니다. 지금 몸과 마음의 긴장도를 체크해 주세요.');

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
  
  if (AppState.currentBgm === 'bowl') playSingingBowl(528, 4.0);
  playChimeUp();
  speakVoice('코로 숨을 천천히 들이마십니다.');
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
      speakVoice('숨을 멈추고 온몸의 긴장을 풉니다.');
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
          
          if (AppState.currentBgm === 'bowl') playSingingBowl(440, 5.0);
          playChimeDown();
          speakVoice('입으로 모든 긴장을 내보냅니다.');
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
    b.className = 'work-status-btn py-3 rounded-2xl border border-slate-800 bg-slate-800/60 text-slate-400';
  });
  btn.className = 'work-status-btn py-3 rounded-2xl border-2 border-blue-500 bg-blue-600/30 text-blue-200 font-bold';
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
  playChimeUp();
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
      btn.className = 'tab-btn flex flex-col items-center gap-1 text-blue-400 active:scale-90 transition';
    } else {
      btn.className = 'tab-btn flex flex-col items-center gap-1 text-slate-400 active:scale-90 transition';
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
