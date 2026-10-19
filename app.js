'use strict';
/* =========================
   HERO — portable media controls
========================= */
const video = document.getElementById('growth');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
if (video) {
  const hero = document.getElementById('home');                 // FVのセクション
  const mobile = window.matchMedia('(max-width: 760px)');       // スマホ判定（CSSと同じ760px）
  const status = document.getElementById('video-status');       // 読み込み失敗時のメッセージ欄
  let selection = '';      // いま読み込んでいる動画（'sp' or 'pc'）
  let heroVisible = true;  // FVが画面に見えているか
  let leftHero = false;    // 一度FVの外へ出たか（戻ってきたら最初から再生するため）

  // 動画を「最初から」再生する（動きを減らす設定の人には再生しない）
  function restart() {
    if (reducedMotion.matches) return;
    try { video.currentTime = 0; } catch (err) {}
    video.play().catch(() => {});   // 自動再生できない環境では表紙画像のまま
  }

  // 画面幅に合わせて スマホ用 / PC用 の動画を選ぶ
  function selectVideo() {
    const key = mobile.matches ? 'sp' : 'pc';
    if (selection === key) return;
    selection = key;
    video.pause();
    video.muted = true;          // 自動再生はミュートが条件
    video.defaultMuted = true;
    video.loop = false;          // 1回再生して最後のコマで止める
    video.poster = video.dataset[key === 'sp' ? 'posterSp' : 'posterPc'];
    video.src = video.dataset[key];
    status.textContent = '';
    video.onloadedmetadata = () => { if (heroVisible) restart(); };
    video.load();
  }

  // ① スクロールでFVから出たら一時停止 → 戻ってきたら最初から再生
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      heroVisible = entry.isIntersecting;
      if (!heroVisible) {
        leftHero = true;
        video.pause();
      } else if (leftHero) {
        leftHero = false;
        restart();
      }
    }, { threshold: 0.35 }).observe(hero);   // FVが35%以上見えたら「戻ってきた」と判断
  }

  // ② 別ページ（作品ページなど）から「戻る」で帰ってきたときも最初から再生
  //    （ブラウザがページを保存していた場合、自動再生が走らないため）
  window.addEventListener('pageshow', event => { if (event.persisted && heroVisible) restart(); });

  // ③ 別のアプリやタブから戻ってきたときも、FVが見えていれば最初から再生
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) video.pause();
    else if (heroVisible) restart();
  });

  // 再生が終わっても映像は最後のコマで止まったまま（ボタンは置かない）
  video.addEventListener('error', () => { status.textContent = '映像を読み込めませんでした。通信環境をご確認ください。'; });
  mobile.addEventListener('change', selectVideo);
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) video.pause(); });
  selectVideo();
}

/* =========================
   MOBILE NAVIGATION
========================= */
const menu = document.querySelector('.menu-toggle');
const navigation = document.getElementById('main-navigation');
if (menu && navigation) {
  const header = menu.closest('.header');
  const mobileNavigation = window.matchMedia('(max-width: 760px)');
  menu.hidden = false;
  header.classList.add('nav-ready');
  function closeMenu(returnFocus = false) {
    navigation.classList.remove('is-open');
    menu.setAttribute('aria-expanded', 'false');
    if (returnFocus) menu.focus();
  }
  menu.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open));
    navigation.classList.toggle('is-open', open);
  });
  navigation.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => closeMenu());
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') closeMenu(true);
  });
  document.addEventListener('click', event => {
    if (!header.contains(event.target)) closeMenu();
  });
  header.addEventListener('focusout', event => {
    if (event.relatedTarget && !header.contains(event.relatedTarget)) closeMenu();
  });
  mobileNavigation.addEventListener('change', () => closeMenu());
}

/* =========================
   HOW — りんごの木：8枚の絵をスクロール量でクロスフェード
   1) ステップ位置（0〜5の小数）を求める
   2) それを「何枚目の絵か」（0〜7の小数）に変換する
   3) 絵ごとに透明度を計算して反映する
   4) 途中の1枚だけ、大きさも少しずつ変える
========================= */
const growthSection = document.getElementById('how');
const treeStack = document.getElementById('tree-stack');
if (growthSection && treeStack) {
  const steps = Array.from(growthSection.querySelectorAll('.growth-step'));  // 5つのステップ
  const frames = Array.from(treeStack.querySelectorAll('.tree-frame'));      // 8枚の絵
  let framePending = false;

  // 基準線：画面の上から60%の位置。ステップがこの線を通過すると次の絵へ進む
  const TRIGGER = 0.6;

  /* 対応表：[ステップ位置, 絵の番号]
     ステップ位置は 0=HEARの先頭、1=RESEARCHの先頭 … 5=GROWの末尾。
     同じ絵の番号が2行続く区間は「その絵のまま止まる」時間になる。 */
  const KEYFRAMES = [
    [0.00, 0], [0.55, 0],   // 01 HEAR     ：種のまま
    [1.00, 1], [1.55, 1],   // 02 RESEARCH ：芽
    [2.00, 2], [2.55, 2],   // 03 DESIGN   ：若木
    [3.00, 3], [3.15, 3],   // 04 CREATE   ：若い木 →
    [3.50, 4], [4.10, 4],   //               葉が茂る（下の GROWTH で大きく育てる）
    [4.35, 5],              // 05 GROW     ：実がふくらむ →
    [4.60, 6],              //               色づく →
    [4.82, 7], [5.00, 7]    //               赤い実で止まる
  ];

  /* 大きさの変化：4番の絵（実のなる木と同じ形の木）を小さめに出し、スクロールで育てる。
     4番以降は木の形がまったく同じなので、葉が減って見える瞬間がない。
     0.88倍のとき、ひとつ前の「若い木」とほぼ同じ大きさになる。 */
  const GROWTH = { frame: 4, fromStep: 3.15, fromScale: 0.88, toStep: 4.10, toScale: 1 };

  const clamp = value => Math.min(1, Math.max(0, value));       // 0〜1に収める
  const smooth = value => value * value * (3 - 2 * value);      // 始めと終わりがゆっくりなS字カーブ

  // 1) 基準線がどのステップのどのあたりにあるかを 0〜5 の小数で返す
  function getStepPosition() {
    const lineY = window.innerHeight * TRIGGER;
    let position = 0;
    steps.forEach((step, index) => {
      const rect = step.getBoundingClientRect();                // 画面内での位置と大きさ
      const inside = clamp((lineY - rect.top) / rect.height);   // このステップを何割通過したか
      if (inside > 0) position = index + inside;
    });
    return position;
  }

  // 2) ステップ位置を、対応表を使って絵の番号（小数）に変換する
  function toFramePosition(stepPosition) {
    for (let i = 1; i < KEYFRAMES.length; i += 1) {
      const [fromStep, fromFrame] = KEYFRAMES[i - 1];
      const [toStep, toFrame] = KEYFRAMES[i];
      if (stepPosition <= toStep) {
        const ratio = clamp((stepPosition - fromStep) / (toStep - fromStep));
        return fromFrame + (toFrame - fromFrame) * ratio;
      }
    }
    return KEYFRAMES[KEYFRAMES.length - 1][1];
  }

  // 3) 4) 絵の番号（小数）から、各画像の透明度と大きさを決める
  function draw(stepPosition) {
    const framePosition = toFramePosition(stepPosition);
    frames.forEach((frame, index) => {
      const distance = framePosition - index;   // この絵が「今」からどれだけ離れているか
      let opacity = 0;
      if (distance > -1 && distance <= 0) {
        // これから現れる絵：区間の前半70%でふわっと濃くなる
        opacity = smooth(clamp((distance + 1) / 0.7));
      } else if (distance > 0 && distance < 1) {
        // 役目を終える絵：次の絵が十分濃くなってから薄くなる（両方が半透明になる瞬間を作らない）
        opacity = 1 - smooth(clamp((distance - 0.4) / 0.6));
      }
      frame.style.opacity = String(opacity);
    });
    // 対象の絵だけ、スクロールに合わせて少しずつ大きくする
    const growRatio = smooth(clamp((stepPosition - GROWTH.fromStep) / (GROWTH.toStep - GROWTH.fromStep)));
    const scale = GROWTH.fromScale + (GROWTH.toScale - GROWTH.fromScale) * growRatio;
    frames[GROWTH.frame].style.transform = `scale(${scale})`;
    // 今のステップに印を付ける（左の線が濃くなる）
    const activeIndex = Math.min(steps.length - 1, Math.floor(stepPosition));
    steps.forEach((step, index) => step.classList.toggle('is-active', index === activeIndex));
  }

  function updateGrowth() {
    framePending = false;
    // 「動きを減らす」設定のときは、実った完成状態で固定する
    if (reducedMotion.matches) { draw(steps.length); return; }
    draw(getStepPosition());
  }
  // スクロールのたびに計算せず、画面の描き換えのタイミングに合わせて1回だけ実行する
  function scheduleGrowth() {
    if (reducedMotion.matches || framePending) return;
    framePending = true;
    window.requestAnimationFrame(updateGrowth);
  }
  window.addEventListener('scroll', scheduleGrowth, { passive: true });
  window.addEventListener('resize', scheduleGrowth, { passive: true });
  reducedMotion.addEventListener('change', updateGrowth);
  updateGrowth();
}

/* =========================
   SELECTED WORKS — 作品カードの切り替え（PC / Smartphone / Reels）
   1) 各カードの .slide から切り替えボタンを作る（2枚以上ある作品だけ）
   2) 静止画は一定時間で、動画は再生が終わったら次へ進む
   3) 画面外・マウスを乗せている間・動きを減らす設定のときは止める
========================= */
{
  const INTERVAL = 3600;    // 静止画を見せる時間（ミリ秒）
  const VIDEO_MAX = 15000;  // 動画を見せる最長時間（ミリ秒）。長い動画でも止まらないための保険
  const STAGGER = 900;      // カードごとのずらし幅（ミリ秒）。全カードが同時に切り替わるのを防ぐ

  const rotators = Array.from(document.querySelectorAll('[data-rotate]')).map((visual, cardIndex) => {
    const slides = Array.from(visual.querySelectorAll('.slide'));
    const card = visual.closest('.work');
    const state = { visual, slides, index: 0, timer: null, visible: false, hovering: false, tabs: [], first: true, offset: cardIndex * STAGGER };

    // 1) 画像が2枚以上ある作品だけ、切り替えボタンを作る
    if (slides.length > 1) {
      const tabBar = document.createElement('div');
      tabBar.className = 'slide-tabs';
      tabBar.setAttribute('role', 'group');
      tabBar.setAttribute('aria-label', '表示する画面');
      slides.forEach((slide, i) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = slide.dataset.label;
        button.setAttribute('aria-pressed', String(i === 0));   // 押されている状態を読み上げソフトに伝える
        button.addEventListener('click', () => { show(state, i); schedule(state); });
        tabBar.appendChild(button);
        state.tabs.push(button);
      });
      visual.appendChild(tabBar);
    }

    slides.forEach(slide => {
      const video = slide.querySelector('video');
      if (!video) return;
      if (slides.length === 1) video.loop = true;   // 動画1本だけの作品は繰り返し再生
      video.addEventListener('ended', () => { if (slide.classList.contains('is-active')) next(state); });
    });

    // マウスを乗せている間・キーボードで中を選んでいる間は自動の切り替えを止める
    card.addEventListener('mouseenter', () => { state.hovering = true; clearTimeout(state.timer); });
    card.addEventListener('mouseleave', () => { state.hovering = false; schedule(state); });
    card.addEventListener('focusin', () => { state.hovering = true; clearTimeout(state.timer); });
    card.addEventListener('focusout', () => { state.hovering = false; schedule(state); });
    return state;
  });

  // 指定した番号の画面を表示し、動画なら頭から再生する
  function show(state, index) {
    state.index = index;
    state.slides.forEach((slide, i) => {
      const active = i === index;
      slide.classList.toggle('is-active', active);
      const video = slide.querySelector('video');
      if (!video) return;
      if (active && state.visible && !reducedMotion.matches) {
        if (state.slides.length > 1) video.currentTime = 0;
        video.play().catch(() => {});   // 再生できない環境では表紙画像のまま
      } else {
        video.pause();
      }
    });
    state.tabs.forEach((tab, i) => tab.setAttribute('aria-pressed', String(i === index)));
  }

  function next(state) {
    show(state, (state.index + 1) % state.slides.length);
    schedule(state);
  }

  // 2) 次に切り替えるまでの時間を予約する（動画の画面は 'ended' で進むので保険の最長時間だけ）
  function schedule(state) {
    clearTimeout(state.timer);
    if (state.slides.length < 2 || reducedMotion.matches || !state.visible || state.hovering) return;  // 3) 止める条件
    const hasVideo = !!state.slides[state.index].querySelector('video');
    let wait = hasVideo ? VIDEO_MAX : INTERVAL;
    if (state.first) { wait += state.offset; state.first = false; }   // 最初の1回だけカードごとにずらす
    state.timer = setTimeout(() => next(state), wait);
  }

  // 3) 画面に映っているカードだけ動かす（IntersectionObserver：要素が画面内に入ったかを知らせる仕組み）
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const state = rotators.find(r => r.visual === entry.target);
        state.visible = entry.isIntersecting;
        if (state.visible) { show(state, state.index); schedule(state); }
        else { clearTimeout(state.timer); state.visual.querySelectorAll('video').forEach(v => v.pause()); }
      });
    }, { threshold: 0.4 });
    rotators.forEach(state => observer.observe(state.visual));
  }
  reducedMotion.addEventListener('change', () => rotators.forEach(state => { show(state, state.index); schedule(state); }));
}

/* =========================
   CONTACT — UI only until a real service is connected
========================= */
// Integration contract: async (FormData) => { ok: boolean }.
// Set only after choosing a real service; never put private API keys in this file.
const contactTransport = null;
const form = document.getElementById('contact-form');
if (form) {
  const button = document.getElementById('contact-submit');
  const status = document.getElementById('form-status');
  const result = document.getElementById('contact-result');
  button.disabled = false;
  function showResult(success) {
    const template = document.getElementById(success ? 'contact-success' : 'contact-error');
    result.replaceChildren(template.content.cloneNode(true));
    result.hidden = false;
    result.setAttribute('tabindex', '-1');
    result.focus();
  }
  async function submitContact(event) {
    event.preventDefault();
    result.hidden = true;
    status.textContent = '';
    for (const key of ['name', 'message']) {
      const input = form.elements.namedItem(key);
      input.setCustomValidity(input.value.trim() ? '' : '空白以外の内容を入力してください。');
    }
    if (!form.reportValidity()) return;
    if (!contactTransport) {
      // No request, storage, success animation, or form reset occurs here.
      status.textContent = '現在フォームでの受付を休止しています。入力内容は送信されていません。';
      return;
    }
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    try {
      const response = await contactTransport(new FormData(form));
      const success = response?.ok === true;
      showResult(success);
      if (success) form.reset();
    } catch {
      showResult(false);
    } finally {
      button.disabled = false;
      form.removeAttribute('aria-busy');
    }
  }
  form.addEventListener('input', event => {
    if (event.target.setCustomValidity) event.target.setCustomValidity('');
  });
  form.addEventListener('submit', submitContact);
  button.addEventListener('click', submitContact);
}
