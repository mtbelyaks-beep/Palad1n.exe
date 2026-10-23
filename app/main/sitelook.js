'use strict';
/**
 * Оформление сайтов: иконки, CSS и первый экран для каждого из шести стилей.
 * Здесь нет данных организации: всё, что попадает в разметку, приходит снаружи уже подготовленным, а текст экранируется функцией esc.
 * Картинок и шрифтов из интернета нет: графика нарисована SVG и CSS, поэтому сайт открывается мгновенно и не ломается без сети.
 */

const ICONS = {
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>',
  comb: '<path d="M4 8h16v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM8 8v6M12 8v6M16 8v6"/>',
  sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  car: '<path d="M5 16l1.5-5.5A2 2 0 0 1 8.4 9h7.2a2 2 0 0 1 1.9 1.5L19 16"/><path d="M3 16h18v3H3z"/><circle cx="7.5" cy="19" r="1"/><circle cx="16.5" cy="19" r="1"/>',
  tire: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/>',
  tooth: '<path d="M7.5 3.5C5 3.5 3.5 5.500 3.500 8c0 2.500 1.500 3.500 2 6 .4 2.500 1 6.500 2.500 6.500s1.500-3.500 2.500-5c.4-.6 1.600-.6 2 0 1 1.500 1 5 2.500 5s2.100-4 2.500-6.500c.5-2.500 2-3.500 2-6 0-2.500-1.500-4.500-4-4.500-1.600 0-2.500.8-3.500.8S9.100 3.500 7.500 3.500z"/>',
  cup: '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2"/>',
  dumbbell: '<path d="M6 7v10M18 7v10M3 9.500v5M21 9.500v5M6 12h12"/>',
  house: '<path d="M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6"/>',
  phone: '<path d="M5 4h4l2 5-2.500 1.500a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  pin: '<path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.500"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="M5 12.500l4.500 4.500L19 7.500"/>',
  star: '<path d="M12 3l2.700 5.600 6.100.9-4.400 4.300 1 6.100L12 17l-5.400 2.900 1-6.100L3.200 9.500l6.100-.9z"/>',
  heart: '<path d="M12 20s-8-5-8-11a4.500 4.500 0 0 1 8-2.500A4.500 4.500 0 0 1 20 9c0 6-8 11-8 11z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.500 8-8 9-4.500-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  brush: '<path d="M4 20c3 0 4-1 4-3a3 3 0 0 1 3-3l8-8a2 2 0 0 0-3-3l-8 8a3 3 0 0 0-3 3c0 2-1 5-1 6z"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.600 7.100L4 20l1-4.600A8 8 0 1 1 21 12z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};

const svg = (name, cls) => `<svg class="${cls || 'ic'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.sparkle}</svg>`;

/* ---------- общая основа ---------- */
const BASE = `*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 var(--font);-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit}img,svg{max-width:100%}.wrap{max-width:1120px;margin:0 auto;padding:0 22px;position:relative}
h1,h2,h3{font-family:var(--head);font-weight:var(--hw);text-transform:var(--upper);margin:0;line-height:1.08;letter-spacing:var(--ls,0)}
p{margin:0}.ic{width:1.4em;height:1.4em;flex:none}
.top{position:sticky;top:0;z-index:20;background:var(--topbg,var(--bg));backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.bar{display:flex;align-items:center;gap:22px;min-height:66px;flex-wrap:wrap;padding-top:8px;padding-bottom:8px}
.logo{font:var(--hw) 21px/1 var(--head);text-transform:var(--upper);text-decoration:none;margin-right:auto;display:flex;align-items:center;gap:10px}
.logo i{width:12px;height:12px;border-radius:50%;background:var(--accent);display:inline-block}
.nav{display:flex;gap:20px;flex-wrap:wrap}.nav a{text-decoration:none;color:var(--muted);font-size:15px;position:relative}.nav a:hover{color:var(--text)}
.nav a:after{content:"";position:absolute;left:0;bottom:-4px;height:2px;width:0;background:var(--accent);transition:width .25s}.nav a:hover:after{width:100%}
.tel{text-decoration:none;font-weight:700;white-space:nowrap;display:flex;align-items:center;gap:8px}
.btn{display:inline-flex;align-items:center;gap:10px;padding:14px 24px;background:var(--accent);color:var(--onAccent);border:2px solid var(--accent);border-radius:var(--r);text-decoration:none;font-weight:700;transition:transform .2s,box-shadow .2s,background .2s;cursor:pointer}
.btn:hover{transform:translateY(-2px)}.btn .ic{width:1.2em;height:1.2em}
.btn.ghost{background:transparent;color:var(--text);border-color:var(--line)}.btn.ghost:hover{border-color:var(--accent)}
.actions{display:flex;gap:12px;flex-wrap:wrap}
.eyebrow{font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:12px}
.sec{padding:84px 0}.sec.alt{background:var(--alt)}
.sec h2{font-size:clamp(28px,4.6vw,46px);margin-bottom:34px;max-width:18em}
.chips{display:flex;gap:10px;flex-wrap:wrap;margin-top:26px}
.chip{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border:1px solid var(--line);border-radius:999px;font-size:14px;background:var(--card);color:var(--muted)}
.chip b{color:var(--text)}.chip .ic{color:var(--accent);width:1.15em;height:1.15em}
.pill{display:inline-block;padding:6px 14px;border-radius:999px;background:var(--card);border:1px solid var(--line);font-size:13px;font-weight:600;color:var(--muted);margin-bottom:22px}
.hero{position:relative;overflow:hidden}
.hero h1{font-size:clamp(36px,6.4vw,76px)}.hero .lead{font-size:clamp(17px,2vw,21px);color:var(--muted);max-width:32em;margin:22px 0 32px}
.rise>*{opacity:0;animation:rise .8s cubic-bezier(.2,.7,.2,1) forwards}.rise>*:nth-child(2){animation-delay:.1s}.rise>*:nth-child(3){animation-delay:.2s}.rise>*:nth-child(4){animation-delay:.3s}.rise>*:nth-child(5){animation-delay:.4s}
@keyframes rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
@keyframes float{50%{transform:translateY(-14px)}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes slide{to{transform:translateX(-50%)}}
.marq{overflow:hidden;white-space:nowrap}.marq .track{display:inline-flex;animation:slide 28s linear infinite;will-change:transform}
.marq span{display:inline-flex;align-items:center;gap:22px;padding-right:22px}.marq span:after{content:"✦";color:var(--accent)}
.svc{display:grid;gap:16px}.svc .it{position:relative;background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:26px;transition:transform .25s,box-shadow .25s,border-color .25s}
.svc .it:hover{transform:translateY(-4px);border-color:var(--accent)}
.svc .n{font:var(--hw) 14px var(--head);color:var(--accent);letter-spacing:.1em}
.svc .ico{display:grid;place-items:center;width:52px;height:52px;border-radius:calc(var(--r) * .8);background:var(--alt);color:var(--accent);margin-bottom:16px}.svc .ico .ic{width:26px;height:26px}
.svc h3{font-size:21px;margin-bottom:8px}.svc p{color:var(--muted)}
.steps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:22px;counter-reset:s}
.steps li{position:relative;padding-top:12px}.steps .n{display:grid;place-items:center;width:46px;height:46px;border-radius:50%;background:var(--accent);color:var(--onAccent);font:var(--hw) 18px var(--head);margin-bottom:16px}
.steps h3{font-size:20px;margin-bottom:6px}.steps p{color:var(--muted)}
.about{display:grid;grid-template-columns:1.2fr .8fr;gap:42px;align-items:center}.about p.big{font-size:clamp(20px,2.6vw,28px);line-height:1.4;font-family:var(--head);font-weight:var(--hw2,500);text-transform:none}
.facts{list-style:none;margin:0;padding:0;display:grid;gap:12px}.facts li{display:flex;gap:12px;align-items:flex-start;padding:14px 16px;background:var(--card);border:1px solid var(--line);border-radius:var(--r)}.facts .ic{color:var(--accent);margin-top:2px}
.facts small{display:block;color:var(--muted);font-size:13px}
.rate{display:flex;align-items:center;gap:22px;flex-wrap:wrap;margin-bottom:26px}.rating{display:flex;align-items:baseline;gap:14px}.rating b{font:var(--hw) clamp(54px,8vw,86px)/1 var(--head);color:var(--accent)}.rating span{color:var(--muted);max-width:11em}
.stars{display:flex;gap:4px;color:var(--accent)}.stars .ic{width:26px;height:26px;fill:currentColor}
.rv{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}.rv .card{background:var(--card);border:1px dashed var(--line);border-radius:var(--r);padding:26px;min-height:150px;display:grid;place-items:center;text-align:center;color:var(--muted)}
.faq{display:grid;gap:12px;max-width:820px}.faq details{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:0 22px;transition:border-color .2s}
.faq details[open]{border-color:var(--accent)}.faq summary{cursor:pointer;list-style:none;padding:20px 28px 20px 0;font-weight:700;font-size:18px;position:relative}
.faq summary::-webkit-details-marker{display:none}.faq summary:after{content:"+";position:absolute;right:0;top:50%;transform:translateY(-50%);font-size:26px;color:var(--accent);transition:transform .25s}
.faq details[open] summary:after{transform:translateY(-50%) rotate(45deg)}.faq details p{padding:0 0 20px;color:var(--muted)}
.map iframe{width:100%;height:380px;border:1px solid var(--line);border-radius:var(--r);background:var(--alt)}
.map .nomap{height:300px;border:1px dashed var(--line);border-radius:var(--r);display:grid;place-items:center;color:var(--muted)}.map p{margin-bottom:18px;color:var(--muted)}
.cta{padding:90px 0;background:var(--ctabg,var(--accent));color:var(--ctatext,var(--onAccent));position:relative;overflow:hidden}
.cta h2{font-size:clamp(30px,5.4vw,60px);max-width:14em;margin-bottom:16px}.cta p{font-size:19px;max-width:32em;opacity:.85;margin-bottom:30px}
.cta .btn{background:var(--ctabtn,var(--onAccent));color:var(--ctabtntext,var(--accent));border-color:var(--ctabtn,var(--onAccent))}
.contacts dl{display:grid;grid-template-columns:max-content 1fr;gap:12px 28px;margin:0 0 28px}.contacts dt{color:var(--muted)}.contacts dd{margin:0;font-weight:600;font-size:18px}
.links{display:flex;gap:12px;flex-wrap:wrap}
footer{padding:32px 0;border-top:1px solid var(--line);color:var(--muted);font-size:14px}
.callbar{display:none}
@media(max-width:820px){.about{grid-template-columns:1fr}.nav{display:none}.sec{padding:56px 0}.contacts dl{grid-template-columns:1fr;gap:4px}.contacts dd{margin-bottom:12px}
.callbar{display:flex;position:fixed;left:12px;right:12px;bottom:12px;z-index:30;justify-content:center;align-items:center;gap:10px;padding:15px;background:var(--accent);color:var(--onAccent);border-radius:var(--r);font-weight:700;text-decoration:none;box-shadow:0 10px 30px rgba(0,0,0,.3)}body{padding-bottom:76px}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.rise>*{opacity:1}}`;

/* ---------- стили: каждый со своей вёрсткой ---------- */
const LOOK = {
  /* Aurora: светлый, воздушный, плавающие карточки */
  clean: `.hero{padding:96px 0 110px;background:radial-gradient(900px 500px at 85% -10%,rgba(47,107,255,.16),transparent 60%),radial-gradient(700px 500px at -10% 40%,rgba(255,120,180,.14),transparent 60%),var(--bg)}
.hero-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:40px;align-items:center}
.hero-art{position:relative;height:430px}.orb{position:absolute;left:50%;top:50%;width:min(340px,100%);aspect-ratio:1;transform-origin:center;margin:0;translate:-50% -50%;border-radius:50%;background:conic-gradient(from 200deg,#2f6bff,#8b5cff,#ff7ab8,#2f6bff);display:grid;place-items:center;color:#fff;animation:spin 40s linear infinite;box-shadow:0 30px 80px rgba(47,107,255,.35)}
.orb:before{content:"";position:absolute;inset:14px;border-radius:50%;background:var(--bg);opacity:.9}.orb .ic{position:relative;width:34%;height:34%;color:var(--accent);animation:spin 40s linear infinite reverse}
.fl{position:absolute;background:#fff;border:1px solid var(--line);border-radius:18px;padding:14px 18px;box-shadow:0 18px 40px rgba(15,27,61,.14);animation:float 6s ease-in-out infinite;display:flex;gap:12px;align-items:center;font-size:14px;color:var(--muted)}
.fl b{display:block;color:var(--text);font-size:17px}.fl.a{left:-10px;top:60px}.fl.b{right:-6px;bottom:50px;animation-delay:-3s}.fl .ic{color:var(--accent);width:28px;height:28px}
.svc{grid-template-columns:repeat(6,1fr)}.svc .it{grid-column:span 2;box-shadow:0 10px 30px rgba(15,27,61,.05)}.svc .it:nth-child(1){grid-column:span 4;background:linear-gradient(135deg,#2f6bff,#6a4dff);color:#fff;border:0}.svc .it:nth-child(1) p,.svc .it:nth-child(1) .n{color:#dfe6ff}.svc .it:nth-child(1) .ico{background:rgba(255,255,255,.18);color:#fff}

.marq{padding:22px 0;border-block:1px solid var(--line);font:var(--hw) 22px var(--head);color:var(--text)}
.cta{background:linear-gradient(120deg,#2f6bff,#8b5cff 60%,#ff7ab8)}`,

  /* Noir: тёмный, золото, засечки, огромный заголовок */
  dark: `.hero{padding:110px 0 120px;background:repeating-linear-gradient(115deg,rgba(212,166,58,.05) 0 18px,transparent 18px 36px),radial-gradient(900px 500px at 85% 10%,rgba(212,166,58,.2),transparent 60%),#0c0c0e}
.hero h1{font-size:clamp(42px,8vw,104px);font-weight:700;font-style:italic;letter-spacing:-.02em;max-width:11em}.hero h1:after{content:"";display:block;width:120px;height:3px;background:var(--accent);margin-top:26px}
.hero .kick{font-size:13px;letter-spacing:.3em;text-transform:uppercase;color:var(--accent);margin-bottom:26px;display:flex;align-items:center;gap:14px}.hero .kick:before{content:"";width:46px;height:1px;background:var(--accent)}
.badge{position:absolute;right:24px;bottom:-30px;width:170px;height:170px;animation:spin 24s linear infinite;color:var(--accent)}.badge text{font:600 10.5px var(--font);letter-spacing:.2em;fill:currentColor}
.badge .ic{position:absolute}
.badgebox{position:absolute;right:4%;bottom:34px;width:170px;height:170px;display:grid;place-items:center;color:var(--accent)}.badgebox>.ic{position:absolute;width:44px;height:44px}
.svc{grid-template-columns:1fr;gap:0}.svc .it{display:grid;grid-template-columns:70px 64px 1fr 1.4fr;gap:22px;align-items:center;border:0;border-top:1px solid var(--line);border-radius:0;background:transparent;padding:30px 8px}.svc .it:last-child{border-bottom:1px solid var(--line)}
.svc .it:hover{transform:none;background:rgba(212,166,58,.06)}.svc .n{font-size:28px;font-style:italic;order:0}.svc .ico{margin:0;order:1;background:transparent;border:1px solid var(--line)}.svc h3{font-size:clamp(22px,3vw,32px);margin:0;order:2}.svc p{order:3}
.marq{padding:20px 0;background:var(--accent);color:#14110a;font:italic 700 26px var(--head)}.marq span:after{color:#14110a}
.steps .n{background:transparent;border:1px solid var(--accent);color:var(--accent);font-style:italic}
.cta{background:radial-gradient(700px 300px at 20% 0,rgba(212,166,58,.3),transparent),#141418;color:var(--text);--ctabtn:var(--accent);--ctabtntext:#14110a}.cta h2{font-style:italic}
@media(max-width:820px){.svc .it{grid-template-columns:44px 1fr;grid-template-areas:"a b" "c c" "d d"}.svc .it .n{display:none}.badgebox{display:none}}`,

  /* Bistro: тёплый, арка, волны, наклонные карточки */
  warm: `.hero{padding:90px 0 130px;background:linear-gradient(180deg,#f6e7d0,#fbf4ea)}
.hero-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:40px;align-items:center}.hero h1{font-style:italic;letter-spacing:-.01em}
.arch{position:relative;height:460px;border-radius:999px 999px 28px 28px;overflow:hidden;background:conic-gradient(from 0deg at 50% 100%,#e98a5f,#f3c07b,#e98a5f,#f3c07b,#e98a5f,#f3c07b,#e98a5f);display:grid;place-items:center;border:8px solid #fffaf2;box-shadow:0 30px 60px rgba(150,90,40,.25);animation:rise 1s both}
.arch .ic{width:44%;height:44%;color:#fffaf2;filter:drop-shadow(0 8px 14px rgba(120,60,20,.35))}.arch:after{content:"";position:absolute;inset:auto 0 0 0;height:36%;background:linear-gradient(0deg,rgba(255,250,242,.5),transparent)}
.sticker{position:absolute;right:-6px;top:30px;transform:rotate(10deg);background:var(--accent);color:#fff;padding:16px 18px;border-radius:50%;width:116px;height:116px;display:grid;place-items:center;text-align:center;font:italic 700 15px/1.2 var(--head);box-shadow:0 10px 24px rgba(150,60,30,.35);animation:float 5s ease-in-out infinite}
.wave{position:absolute;left:0;right:0;bottom:-1px;height:70px;color:var(--bg)}
.svc{grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:26px}.svc .it{background:#fffaf2;border:0;box-shadow:0 14px 30px rgba(120,80,40,.12);padding:30px 26px;transform:rotate(-1.2deg)}.svc .it:nth-child(even){transform:rotate(1.2deg)}.svc .it:hover{transform:rotate(0) translateY(-6px)}
.svc .ico{border-radius:50%;background:#f6e0c4;width:60px;height:60px}.svc h3{font-style:italic}
.marq{padding:20px 0;background:var(--accent);color:#fff;font:italic 700 24px var(--head)}.marq span:after{color:#ffe1b8}
.sec.alt{background:#f4e8d6}.cta{background:#3a2a20;--ctabtn:#f3c07b;--ctabtntext:#3a2a20;color:#fbf4ea}.cta h2{font-style:italic}`,

  /* Poster: жёлтый и чёрный, гигантские буквы, наклейки */
  bold: `.hero{padding:70px 0 0;background:var(--yellow,#ffe14d);border-bottom:6px solid #111}
.hero h1{font-size:clamp(38px,8.2vw,112px);line-height:.95;font-weight:900;max-width:10em;overflow-wrap:anywhere;margin-bottom:10px}.hero h1 mark{background:#111;color:#ffe14d;padding:0 .12em}
.hero .lead{color:#111;font-weight:600;max-width:30em}.hero .wrap{padding-bottom:70px}
.rise>.stk{opacity:1;animation:float 4s ease-in-out infinite}.stk{position:absolute;right:26px;top:10px;z-index:3;transform:rotate(8deg);background:#111;color:#ffe14d;padding:18px 22px;font:900 20px/1.1 var(--head);text-transform:uppercase;text-align:center;border-radius:6px;box-shadow:6px 6px 0 #fff;animation:float 4s ease-in-out infinite}.stk b{display:block;font-size:44px}
.tape{background:#111;color:#ffe14d;padding:16px 0;font:900 26px var(--head);text-transform:uppercase;transform:rotate(-1.4deg);margin:-26px -20px 0;border-block:4px solid #ffe14d;position:relative;z-index:2}.tape span:after{color:#ffe14d}
.svc{grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:22px}.svc .it{border:3px solid #111;box-shadow:8px 8px 0 #111;border-radius:6px;background:#fff}.svc .it:hover{transform:translate(-3px,-3px);box-shadow:12px 12px 0 #111}
.svc .it:nth-child(3n+2){background:#ffe14d}.svc .ico{background:#111;color:#ffe14d;border-radius:6px}.svc .n{font-size:40px;position:absolute;right:20px;top:14px;color:#111;opacity:.15}
.sec.alt{background:#ffe14d;border-block:4px solid #111}.steps .n{background:#111;color:#ffe14d;border-radius:6px;width:56px;height:56px;font-size:26px;box-shadow:4px 4px 0 var(--accent)}
.faq details{border:3px solid #111;border-radius:6px;box-shadow:5px 5px 0 #111}.cta{background:#111;color:#fff;--ctabtn:#ffe14d;--ctabtntext:#111}.cta h2 mark{background:#ffe14d;color:#111;padding:0 .12em}
.btn{border-width:3px;border-color:#111;box-shadow:5px 5px 0 #111}.btn:hover{box-shadow:8px 8px 0 #111}.btn.ghost{border-color:#111;background:#fff}.cta .btn{border-color:#ffe14d;box-shadow:5px 5px 0 var(--accent)}
.top{border-bottom:4px solid #111}.chip{border:2px solid #111;color:#111;background:#fff}`,

  /* Pastel: стекло, пузыри, плавающие иконки */
  soft: `.hero{padding:90px 0 110px;background:linear-gradient(135deg,#ffe3f1,#ece0ff 60%,#dff0ff)}
.hero:before,.hero:after{content:"";position:absolute;border-radius:50%;filter:blur(10px);opacity:.7;animation:float 9s ease-in-out infinite}.hero:before{width:380px;height:380px;background:#ffb8dc;left:-100px;top:-120px}.hero:after{width:300px;height:300px;background:#c9b6ff;right:-60px;bottom:-100px;animation-delay:-4s}
.glass{position:relative;max-width:760px;margin:0 auto;padding:48px 44px;border-radius:40px;background:rgba(255,255,255,.55);border:1px solid rgba(255,255,255,.9);backdrop-filter:blur(18px);box-shadow:0 30px 80px rgba(160,90,170,.22);text-align:center}
.glass .lead{margin-left:auto;margin-right:auto}.glass .actions,.glass .chips{justify-content:center}
.bub{position:absolute;width:74px;height:74px;border-radius:50%;background:#fff;color:var(--accent);display:grid;place-items:center;box-shadow:0 14px 30px rgba(180,100,170,.25);animation:float 6s ease-in-out infinite}.bub .ic{width:32px;height:32px}
.bub.a{left:-26px;top:-24px}.bub.b{right:-30px;top:40%;animation-delay:-2s}.bub.c{left:8%;bottom:-34px;animation-delay:-4s}
.svc{grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:22px}.svc .it{border:0;background:#fff;box-shadow:0 16px 40px rgba(180,100,170,.14);text-align:center;padding:34px 24px}.svc .it:nth-child(3n+1){background:linear-gradient(160deg,#fff,#ffeaf5)}.svc .it:nth-child(3n+2){background:linear-gradient(160deg,#fff,#efe6ff)}.svc .it:nth-child(3n){background:linear-gradient(160deg,#fff,#e4f3ff)}
.svc .ico{margin:0 auto 18px;border-radius:50%;width:70px;height:70px;background:#fff;box-shadow:0 8px 20px rgba(180,100,170,.18)}.svc .n{display:none}
.marq{padding:18px 0;background:#fff;font:700 21px var(--head);color:var(--accent)}.btn{box-shadow:0 10px 24px rgba(214,95,160,.35)}
.cta{background:linear-gradient(135deg,#ff8fc4,#a98bff)}.steps .n{box-shadow:0 8px 20px rgba(214,95,160,.4)}.sec h2{margin-left:auto;margin-right:auto;text-align:center}.sec .eyebrow{text-align:center}`,

  /* Trust: сетка, глубокий синий, цифры и таймлайн */
  corp: `.hero{padding:96px 0 150px;background:linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px) 0 0/48px 48px,linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px) 0 0/48px 48px,linear-gradient(120deg,#0e2a4a,#1d4d7d);color:#fff}
.hero .lead{color:#c8d6e8}.hero .eyebrow{color:#8fc1ff}.hero-grid{display:grid;grid-template-columns:1.3fr .7fr;gap:40px;align-items:end}.hero h1{font-size:clamp(34px,5.4vw,64px);max-width:13em}
.hero .btn{background:#fff;color:#12355b;border-color:#fff}.hero .btn.ghost{background:transparent;color:#fff;border-color:rgba(255,255,255,.45)}
.panel{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);border-radius:var(--r);padding:24px;backdrop-filter:blur(8px)}.panel h3{font-size:14px;letter-spacing:.14em;text-transform:uppercase;color:#8fc1ff;margin-bottom:14px}
.panel li{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-top:1px solid rgba(255,255,255,.14);font-size:15px;list-style:none}.panel ul{margin:0;padding:0}.panel li:first-child{border:0}.panel .ic{color:#8fc1ff;margin-top:2px}
.stat{position:relative;z-index:2;margin-top:-62px}.stat .wrap{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));background:var(--card);border:1px solid var(--line);border-radius:var(--r);box-shadow:0 20px 50px rgba(18,53,91,.16);padding:0}
.stat div{padding:26px 28px;border-right:1px solid var(--line)}.stat div:last-child{border:0}.stat b{display:block;font:700 34px var(--head);color:var(--accent)}.stat span{color:var(--muted);font-size:14px}
.svc{grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}.svc .it{border-radius:var(--r)}.svc .it:hover{transform:none;background:var(--alt)}.svc .it:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--accent);transform:scaleY(0);transform-origin:top;transition:transform .3s}.svc .it:hover:before{transform:none}
.steps{counter-reset:s;position:relative}.steps li{padding:26px;border:1px solid var(--line);background:var(--card);border-radius:var(--r)}.steps .n{border-radius:var(--r);width:44px;height:44px}
.marq{display:none}.cta{background:linear-gradient(120deg,#0e2a4a,#1d4d7d);--ctabtn:#fff;--ctabtntext:#12355b;color:#fff}`,
};

/* Крупная круговая надпись для тёмного стиля */
const ringText = (text) => `<svg class="badge" viewBox="0 0 170 170" aria-hidden="true"><defs><path id="ring" d="M85 85 m-62 0 a62 62 0 1 1 124 0 a62 62 0 1 1 -124 0"/></defs><text><textPath href="#ring">${text}</textPath></text></svg>`;

/** CSS: общая основа плюс то, что делает стиль узнаваемым. */
const buildCss = (styleId) => BASE + (LOOK[styleId] || '');

/**
 * Первый экран. d: { esc, headline, sub, name, rubric, where, phone, phoneFmt, rating, reviews, icon, actions }
 * actions — готовый HTML кнопок (собран в вызывающем коде и уже безопасен).
 */
function buildHero(styleId, d) {
  const e = d.esc;
  const rate = d.rating ? `<span class="chip">${svg('star')}<b>${e(String(d.rating).replace('.', ','))}</b> в 2ГИС${d.reviews ? ` · ${d.reviews} отз.` : ''}</span>` : '';
  const where = d.where ? `<span class="chip">${svg('pin')}${e(d.where)}</span>` : '';
  const chips = (rate || where) ? `<div class="chips">${rate}${where}</div>` : '';
  const tag = [d.rubric, d.district].filter(Boolean).join(' · ');
  switch (styleId) {
    case 'dark':
      return `<section class="hero"><div class="wrap rise"><div class="kick">${e(tag || d.name)}</div><h1>${e(d.headline)}</h1><p class="lead" style="margin-top:28px">${e(d.sub)}</p><div class="actions">${d.actions}</div>${chips}</div>
<div class="badgebox">${ringText(e(('Запись по телефону · ' + (d.phoneFmt || d.name) + ' · ').toUpperCase()))}${svg(d.icon)}</div></section>`;
    case 'warm':
      return `<section class="hero"><div class="wrap hero-grid"><div class="rise"><span class="pill">${e(tag || d.name)}</span><h1>${e(d.headline)}</h1><p class="lead">${e(d.sub)}</p><div class="actions">${d.actions}</div>${chips}</div>
<div style="position:relative"><div class="arch">${svg(d.icon)}</div><div class="sticker">${e(d.district || 'рядом с вами')}</div></div></div>
<svg class="wave" viewBox="0 0 1440 70" preserveAspectRatio="none" aria-hidden="true"><path fill="currentColor" d="M0 40c240 40 480 40 720 10s480-30 720 10v10H0z"/></svg></section>`;
    case 'bold': {
      const words = String(d.headline).trim().split(/\s+/);
      const k = Math.min(words.length - 1, Math.max(1, Math.round(words.length / 3)));
      const h1 = words.length > 2 ? `${e(words.slice(0, k).join(' '))} <mark>${e(words.slice(k, k + 2).join(' '))}</mark> ${e(words.slice(k + 2).join(' '))}` : e(d.headline);
      return `<section class="hero"><div class="wrap rise"><h1>${h1}</h1><p class="lead">${e(d.sub)}</p><div class="actions">${d.actions}</div>${chips}${d.rating ? `<div class="stk"><b>${e(String(d.rating).replace('.', ','))}</b>в 2ГИС</div>` : ''}</div></section>`;
    }
    case 'soft':
      return `<section class="hero"><div class="wrap"><div class="glass rise"><span class="bub a">${svg(d.icon)}</span><span class="bub b">${svg('heart')}</span><span class="bub c">${svg('sparkle')}</span><span class="pill">${e(tag || d.name)}</span><h1>${e(d.headline)}</h1><p class="lead">${e(d.sub)}</p><div class="actions">${d.actions}</div>${chips}</div></div></section>`;
    case 'corp':
      return `<section class="hero"><div class="wrap hero-grid"><div class="rise"><div class="eyebrow">${e(tag || d.name)}</div><h1>${e(d.headline)}</h1><p class="lead">${e(d.sub)}</p><div class="actions">${d.actions}</div></div>
<div class="panel rise"><h3>Коротко о нас</h3><ul>${d.where ? `<li>${svg('pin')}<span>${e(d.where)}</span></li>` : ''}${d.phoneFmt ? `<li>${svg('phone')}<span>${e(d.phoneFmt)}</span></li>` : ''}${d.rating ? `<li>${svg('star')}<span>Рейтинг ${e(String(d.rating).replace('.', ','))} в 2ГИС</span></li>` : ''}<li>${svg('shield')}<span>${e(d.rubric || 'Работаем в вашем районе')}</span></li></ul></div></div></section>`;
    default:
      return `<section class="hero"><div class="wrap hero-grid"><div class="rise"><span class="pill">${e(tag || d.name)}</span><h1>${e(d.headline)}</h1><p class="lead">${e(d.sub)}</p><div class="actions">${d.actions}</div>${chips}</div>
<div class="hero-art"><div class="orb">${svg(d.icon)}</div>${d.phoneFmt ? `<div class="fl a">${svg('phone')}<span>Позвоните нам<b>${e(d.phoneFmt)}</b></span></div>` : ''}${d.rating ? `<div class="fl b">${svg('star')}<span>Рейтинг в 2ГИС<b>${e(String(d.rating).replace('.', ','))}</b></span></div>` : ''}</div></div></section>`;
  }
}

module.exports = { ICONS, svg, buildCss, buildHero };
