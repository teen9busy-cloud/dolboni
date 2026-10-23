/**
 * 돌보니(Dolboni) 하이브리드 네이티브 앱 코어 로직 (app.js v2.0)
 * - 한국어 나긋한 음성 안내 (Web Speech API)
 * - 4대 힐링 사운드 생성기 (Web Audio API):
 *   1) 🔔 쇠그릇(티베탄 싱잉볼 종소리)
 *   2) 🌊 계곡 물소리 (시냇물 브라운 노이즈)
 *   3) 🌲 숲속 새소리 (주기적 자연 지저귐)
 *   4) 🎵 편안한 명상음악 (432Hz 힐링 앰비언트 코드 패드)
 * - Capacitor Haptics (호흡별 정밀 진동)
 * - 4-7-8 이완 호흡 사이클 및 사후 체크인
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
  activeBgNodes: [],        // 활성화된 BGM 오디오 노드
  birdTimer: null,
};

// 2. 초기화
document.addEventListener('DOMContentLoaded', () => {
  initAudio();
  updateHeaderPoints(AppState.user.totalPoints);
  renderTeamStatusMockCard();

  // 사용자 첫 터치 시 AudioContext 자동 활성화
  document.body.addEventListener('click', () => {
    if (AppState.audioCtx && AppState.audioCtx.state === 'suspended') {
      AppState.audioCtx.resume();
    }
  }, { once: true });
});

// 3. Web Audio Context 초기화
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

// ------------------------------------------------------------------------------
// 4. 한국어 음성 안내 (Web Speech API)
// ------------------------------------------------------------------------------
function speakVoice(text) {
  if (!AppState.voiceEnabled) return;
  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // 이전 발화 취소
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 0.85;  // 차분하고 여유로운 속도
      utterance.pitch = 0.95; // 편안한 중저음
      utterance.volume = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  } catch (err) {
    console.warn('SpeechSynthesis error:', err);
  }
}

function toggleVoiceGuidance() {
  AppState.voiceEnabled = !AppState.voiceEnabled;
  const btn = document.getElementById('btn-voice-toggle');
  const icon = document.getElementById('voice-icon');
  const label = document.getElementById('voice-label');

  if (AppState.voiceEnabled) {
    btn.className = 'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 transition';
    icon.textContent = '🗣️';
    label.textContent = '음성안내 ON';
    speakVoice('음성 안내가 켜졌습니다.');
  } else {
    btn.className = 'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700 transition';
    icon.textContent = '🔇';
    label.textContent = '음성안내 OFF';
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }
}

// ------------------------------------------------------------------------------
// 5. 4대 힐링 사운드 신시사이저 (Web Audio API)
// ------------------------------------------------------------------------------
function selectBgm(type, btn) {
  AppState.currentBgm = type;
  document.querySelectorAll('.bgm-btn').forEach(b => {
    b.className = 'bgm-btn flex-shrink-0 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-800/80 text-slate-400 font-bold';
  });
  btn.className = 'bgm-btn flex-shrink-0 px-3 py-1.5 rounded-xl border border-amber-500/50 bg-amber-500/20 text-amber-300 font-bold shadow-sm';

  stopContinuousBgm();

  if (AppState.isBreathing) {
    startContinuousBgm();
  } else {
    // 테스트용 1회성 사운드 미리듣기
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
  if (!AppState.audioCtx) return;
  if (AppState.audioCtx.state === 'suspended') AppState.audioCtx.resume();

  if (type === 'bowl') {
    playSingingBowl(216, 4.0);
  } else if (type === 'stream') {
    playStreamBurst(2.5);
  } else if (type === 'birds') {
    playBirdChirp();
  } else if (type === 'music') {
    playAmbientChord(3.0);
  }
}

function startContinuousBgm() {
  if (!AppState.audioCtx || AppState.currentBgm === 'mute') return;
  if (AppState.audioCtx.state === 'suspended') AppState.audioCtx.resume();

  stopContinuousBgm();

  if (AppState.currentBgm === 'stream') {
    // 지속적인 계곡 물소리 생성
    startStreamAudio();
  } else if (AppState.currentBgm === 'birds') {
    // 지속적인 숲속 새소리 주기적 트리거
    playBirdChirp();
    AppState.birdTimer = setInterval(() => {
      if (AppState.isBreathing && AppState.currentBgm === 'birds') {
        playBirdChirp();
      }
    }, 3800);
  } else if (AppState.currentBgm === 'music') {
    // 지속적인 432Hz 명상 앰비언트 패드
    startAmbientPad();
  } else if (AppState.currentBgm === 'bowl') {
    // 싱잉볼은 호흡 단계 전환마다 타종
    playSingingBowl(216, 5.0);
  }
}

// [사운드 1] 🔔 쇠그릇 (티베탄 싱잉볼 / 종소리)
function playSingingBowl(baseFreq = 216, duration = 5.0) {
  if (!AppState.audioCtx) return;
  try {
    const ctx = AppState.audioCtx;
    const now = ctx.currentTime;
    // 티베탄 싱잉볼의 배음 구조 (기음 + 배음들)
    const partials = [
      { f: baseFreq, g: 0.35 },
      { f: baseFreq * 2.76, g: 0.18 }, // 금속 배음 1
      { f: baseFreq * 5.4, g: 0.08 },  // 금속 배음 2
      { f: baseFreq + 1.5, g: 0.12 }   // 은은한 바이노럴 울림맥동
    ];

    partials.forEach(p => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(p.f, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(p.g, now + 0.08); // 부드러운 타격
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration); // 긴 여운

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    });
  } catch (err) {
    console.warn('Singing bowl error:', err);
  }
}

// [사운드 2] 🌊 계곡 물소리 (Stream Generator via Pink Noise)
function startStreamAudio() {
  try {
    const ctx = AppState.audioCtx;
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // 핑크 노이즈 버퍼 생성
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
      b6 = white * 0.115926;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    // 계곡 물소리용 공명 저역/대역 필터
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(650, ctx.currentTime);

    // 물의 출렁임 LFO
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.setValueAtTime(0.4, ctx.currentTime); // 0.4Hz 물결
    lfoGain.gain.setValueAtTime(200, ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, ctx.currentTime);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start();
    lfo.start();

    AppState.activeBgNodes.push(noise, lfo, gain, filter);
  } catch (err) {
    console.warn('Stream audio error:', err);
  }
}

function playStreamBurst(duration = 2.5) {
  startStreamAudio();
  setTimeout(() => {
    if (!AppState.isBreathing) stopContinuousBgm();
  }, duration * 1000);
}

// [사운드 3] 🌲 숲속 새소리 (Bird Chirp Synthesizer)
function playBirdChirp() {
  if (!AppState.audioCtx) return;
  try {
    const ctx = AppState.audioCtx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // 새 지저귐 주파수 곡선
    osc.frequency.setValueAtTime(2800, now);
    osc.frequency.exponentialRampToValueAtTime(3600, now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(2400, now + 0.18);
    osc.frequency.exponentialRampToValueAtTime(3200, now + 0.28);
    osc.frequency.exponentialRampToValueAtTime(2200, now + 0.42);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.48);
  } catch (err) {
    console.warn('Bird chirp error:', err);
  }
}

// [사운드 4] 🎵 432Hz 편안한 명상 앰비언트 코드 패드
function startAmbientPad() {
  try {
    const ctx = AppState.audioCtx;
    const now = ctx.currentTime;
    // 432Hz 기반 D Major 9th 코드 화음 (치유 주파수 패드)
    const chord = [216, 272.2, 324, 432];

    chord.forEach(freq => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 1.5);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      AppState.activeBgNodes.push(osc, gain);
    });
  } catch (err) {
    console.warn('Ambient pad error:', err);
  }
}

function playAmbientChord(duration = 3.0) {
  startAmbientPad();
  setTimeout(() => {
    if (!AppState.isBreathing) stopContinuousBgm();
  }, duration * 1000);
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
  
  if (AppState.currentBgm === 'bowl') playSingingBowl(216, 4.0);
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
          
          if (AppState.currentBgm === 'bowl') playSingingBowl(162, 5.0);
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

// ------------------------------------------------------------------------------
// 8. 상태 선택 & 긴장도 레이블
// ------------------------------------------------------------------------------
function selectWorkStatus(status, btn) {
  AppState.workStatus = status;
  document.querySelectorAll('.work-status-btn').forEach(b => {
    b.className = 'work-status-btn py-2 rounded-xl border border-slate-800 bg-slate-800/60 text-slate-400';
  });
  btn.className = 'work-status-btn py-2 rounded-xl border border-blue-500/40 bg-blue-600/20 text-blue-300 font-bold';
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
