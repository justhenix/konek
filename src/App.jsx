import { useEffect, useRef, useState, Fragment } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { animate, createScope, stagger, utils } from 'animejs'; 
import './App.css';

// --- IMPORT FOTO TIM KREATOR ---
import fotoAqiel from './assets/AKILRAJAIBLIS.png';
import fotoBudi from './assets/FRESHIFA.png';
import fotoSiti from './assets/HENIX.png';

// --- IMPORT LOGO BARU ---
import logoSolana from './assets/LogoSolana.png';
import logoPhantom from './assets/LogoPhantom.png';
import logoMidtrans from './assets/LogoMidtrans.png';

// --- IMPORT KOMPONEN TRANSAKSI ---
import QrisScanner from './QrisScanner';
import PaymentPage from './PaymentPage'; // Pastikan file PaymentPage.jsx udah ada di folder src

const hashString = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
  return Math.abs(hash).toString(16);
};

const teamMembers = [
  {
    id: 1,
    name: "Aqiel ",
    role: "ROLE",
    desc: "Deskripsi",
    tags: ["ROOLS", "ROOLS", "ROOLS"],
    bgClass: "bg-brand",
    shadowClass: "shadow-[0_0_50px_rgba(4,250,58,0.4)]",
    photo: fotoAqiel, 
  },
  {
    id: 2,
    name: "gamma",
    role: "Role",
    desc: "Deskripsi",
    tags: ["ROOLS", "ROOLS", "ROOLS"],
    bgClass: "bg-purple-600",
    shadowClass: "shadow-[0_0_50px_rgba(147,51,234,0.4)]",
    photo: fotoBudi, 
  },
  {
    id: 3,
    name: "Al G razan",
    role: "Role",
    desc: "Deskripsi",
    tags: ["ROOLS", "ROOLS ROOLS", "ROOLS"],
    bgClass: "bg-blue-500",
    shadowClass: "shadow-[0_0_50px_rgba(59,130,246,0.4)]",
    photo: fotoSiti, 
  }
];

function App() {
  const root = useRef(null);
  const scope = useRef(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [solPrice, setSolPrice] = useState(null);
  const [theme, setTheme] = useState('dark');
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  const { select, wallets, publicKey, connect } = useWallet();

  // --- STATE UNTUK FLOW APLIKASI (LOGIN -> SCAN -> PAY) ---
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedData, setScannedData] = useState(null);

  // ==========================================
  // AREA BACKEND DEV: STATE USER PROFILE 
  // ==========================================
  const [userProfile, setUserProfile] = useState({
    isLoggedIn: false, 
    name: "Guest", 
    avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=Guest` 
  });

  useEffect(() => {
    if (publicKey) {
      const pKeyStr = publicKey.toBase58();
      if (import.meta.env.DEV) {
        console.log(pKeyStr);
      }
      setUserProfile({
        isLoggedIn: true,
        name: `${pKeyStr.slice(0, 4)}...${pKeyStr.slice(-4)}`,
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${hashString(pKeyStr)}`
      });
      setIsLoginModalOpen(false);
    } else {
      setUserProfile({
        isLoggedIn: false, 
        name: "Guest", 
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=Guest` 
      });
    }
  }, [publicKey]);

  // ==========================================
  // 🚨 AREA BACKEND DEV: FUNGSI KONEK WALLET 🚨
  // ==========================================
  const handleConnectWallet = async () => {
    try {
      const phantomWallet = wallets.find((w) => w.adapter.name === 'Phantom');
      if (phantomWallet) {
        if (phantomWallet.readyState === 'Installed' || phantomWallet.readyState === 'Loadable') {
          select(phantomWallet.adapter.name);
          await connect();
        } else {
          alert("Phantom Wallet is not ready or installed. Please install it to continue.");
          window.open("https://phantom.app/", "_blank");
        }
      } else {
        alert("Phantom Wallet is not installed.");
        window.open("https://phantom.app/", "_blank");
      }
    } catch (error) {
      console.error("Failed to connect to wallet:", error);
    }
  };
  // ==========================================

  // Fungsi pengatur klik tombol utama (Launch App / QRIS Pay)
  const handleOpenApp = () => {
    if (userProfile.isLoggedIn && publicKey) {
      setIsScannerOpen(true); // Kalau udah login, buka kamera
    } else {
      setIsLoginModalOpen(true); // Kalau belum login, minta konek dompet
    }
  };

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  const handleNext = () => setActiveIdx((prev) => (prev + 1) % teamMembers.length);
  const handlePrev = () => setActiveIdx((prev) => (prev - 1 + teamMembers.length) % teamMembers.length);

  useEffect(() => {
    const timer = setInterval(() => handleNext(), 4000); 
    return () => clearInterval(timer);
  }, [activeIdx]);

  const minSwipeDistance = 50;
  const onTouchStart = (e) => { setTouchEnd(null); setTouchStart(e.targetTouches[0].clientX); };
  const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX);
  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    if (distance > minSwipeDistance) handleNext(); 
    if (distance < -minSwipeDistance) handlePrev(); 
  };

  const playCreatorAnimation = () => {
    animate('.square', { x: 0, y: 0, scale: 1, rotate: 0, borderRadius: '16px', duration: 10 });
    setTimeout(() => {
      animate('.square', {
        x: (el) => parseInt(el.dataset.x || 0), 
        y: (el, index) => 50 + (-50 * index), 
        scale: (el, index, length) => (length - index) * 0.65, 
        rotate: () => utils.random(-360, 360), 
        borderRadius: () => `${utils.random(10, 40)}%`, 
        duration: () => utils.random(1200, 1800),
        delay: () => utils.random(0, 400),
        ease: 'outElastic(1, .5)', 
      });
    }, 30);
  };

  useEffect(() => {
    let observer;
    const fetchSolPrice = async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=idr');
        const data = await response.json();
        setSolPrice(data.solana.idr);
      } catch (error) {
        console.error("Gagal mengambil harga SOL:", error);
      }
    };

    fetchSolPrice();
    const priceInterval = setInterval(fetchSolPrice, 60000);

    scope.current = createScope({ root }).add(() => {
      animate('.nav-item', { translateY: [-30, 0], opacity: [0, 1], duration: 800, delay: stagger(100), ease: 'out(3)' });
      animate('.hero-text', { translateY: [50, 0], opacity: [0, 1], duration: 1000, delay: stagger(200, { start: 500 }), ease: 'out(4)' });
      animate('.logo-konek path', { strokeDashoffset: [105, 0], easing: 'easeInOutQuart', duration: 1500, delay: stagger(400, { start: 1000 }) });

      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (entry.target.classList.contains('creator-section')) {
              animate(entry.target, { opacity: [0, 1], duration: 800 });
              playCreatorAnimation();
            } else {
              animate(entry.target, { translateY: [50, 0], opacity: [0, 1], duration: 1200, easing: 'easeOutQuart' });
            }
            observer.unobserve(entry.target); 
          }
        });
      }, { threshold: 0.2 });

      const scrollElements = document.querySelectorAll('.scroll-animate, .creator-section');
      scrollElements.forEach((el) => observer.observe(el));
    });

    return () => {
      scope.current.revert();
      if (observer) observer.disconnect();
      clearInterval(priceInterval);
    };
  }, []);

  return (
    <div className="relative min-h-screen flex flex-col p-4 md:p-8 lg:px-20 bg-zinc-50 dark:bg-[#1c1a17] text-zinc-900 dark:text-white selection:bg-brand selection:text-black transition-colors duration-500" ref={root}>
      
      <style>
        {`
          @keyframes custom-float {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(3deg); }
          }
        `}
      </style>

      {/* NAVBAR STICKY */}
      <nav className="sticky top-6 flex justify-between items-center bg-white/70 dark:bg-zinc-800/60 backdrop-blur-xl px-6 py-4 md:px-10 rounded-2xl md:rounded-full border border-zinc-200 dark:border-white/10 shadow-xl dark:shadow-[0_20px_40px_rgba(0,0,0,0.5)] z-50 nav-item opacity-0 transition-colors duration-500">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 100 100" className="w-8 h-8">
             <path stroke="var(--color-brand)" strokeWidth="14" fill="none" strokeLinecap="round" strokeLinejoin="round" d="M 10 85 L 35 15 L 55 35" />
             <path stroke="var(--color-brand)" strokeWidth="14" fill="none" strokeLinecap="round" strokeLinejoin="round" d="M 90 15 L 65 85 L 45 65" />
          </svg>
          <h2 className="text-xl font-extrabold tracking-widest uppercase text-black dark:text-white transition-colors duration-500">Konek<span className="text-brand">Pay</span></h2>
        </div>

        {/* MENU TENGAH DESKTOP */}
        <ul className="hidden md:flex items-center gap-8 text-xs font-bold tracking-widest text-zinc-500 dark:text-zinc-400 absolute left-1/2 -translate-x-1/2 transition-colors duration-500">
          <li className="hover:text-brand cursor-pointer transition-colors" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>HOME</li>
          <li className="hover:text-brand cursor-pointer transition-colors" onClick={() => document.getElementById('about-section').scrollIntoView({ behavior: 'smooth' })}>ABOUT</li>
          <li 
            className="bg-brand/10 border border-brand text-brand hover:bg-brand hover:text-black px-5 py-2 rounded-full cursor-pointer transition-all duration-300 shadow-[0_0_15px_rgba(4,250,58,0.2)] hover:shadow-[0_0_25px_rgba(4,250,58,0.5)]" 
            onClick={() => document.getElementById('workflow-section').scrollIntoView({ behavior: 'smooth' })}
          >
            HOW IT WORKS
          </li>
          <li className="hover:text-brand cursor-pointer transition-colors" onClick={() => document.getElementById('team-section').scrollIntoView({ behavior: 'smooth' })}>TEAM</li>
        </ul>

        <div className="flex items-center gap-2 md:gap-4">
          {/* USER PROFILE / LOGIN BUTTON */}
          {userProfile.isLoggedIn ? (
            <div className="flex items-center gap-2 md:gap-3 mr-1 md:mr-2 border-r border-zinc-200 dark:border-white/10 pr-3 md:pr-4 transition-colors">
              <span className="hidden md:block text-xs font-bold text-zinc-700 dark:text-zinc-300 transition-colors">
                Hi, {userProfile.name}!
              </span>
              <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden border border-brand/40 shadow-[0_0_10px_rgba(4,250,58,0.2)] hover:border-brand transition-all cursor-pointer">
                <img src={userProfile.avatarUrl} alt="User Avatar" className="w-full h-full object-cover" />
              </div>
            </div>
          ) : (
            <button 
              onClick={() => setIsLoginModalOpen(true)}
              className="mr-2 text-xs font-bold bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-white px-4 py-2 rounded-full transition-colors"
            >
              Connect Wallet
            </button>
          )}

          <button onClick={toggleTheme} className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-700/50 text-zinc-600 dark:text-zinc-300 hover:text-brand dark:hover:text-brand transition-all duration-300 focus:outline-none">
            {theme === 'dark' ? (
              <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
            ) : (
              <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
            )}
          </button>

          <button className="md:hidden p-2 text-zinc-600 dark:text-zinc-300 hover:text-brand dark:hover:text-brand focus:outline-none transition-colors" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            <div className="relative w-6 h-5">
              <span className={`absolute left-0 w-full h-0.5 bg-current transition-all duration-300 ease-in-out ${isMenuOpen ? 'top-1/2 -translate-y-1/2 rotate-45' : 'top-0'}`} />
              <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-current transition-all duration-300 ease-in-out ${isMenuOpen ? 'opacity-0 scale-x-0' : 'opacity-100 scale-x-100'}`} />
              <span className={`absolute left-0 w-full h-0.5 bg-current transition-all duration-300 ease-in-out ${isMenuOpen ? 'top-1/2 -translate-y-1/2 -rotate-45' : 'top-full -translate-y-full'}`} />
            </div>
          </button>
        </div>
      </nav>

      {/* DROPDOWN MENU MOBILE */}
      <div className={`md:hidden fixed top-24 left-6 right-6 z-40 bg-white/95 dark:bg-zinc-800/95 backdrop-blur-xl border border-zinc-200 dark:border-white/10 rounded-3xl p-8 shadow-2xl transition-all duration-500 flex flex-col items-center ${isMenuOpen ? 'opacity-100 translate-y-0 visible' : 'opacity-0 -translate-y-8 invisible'}`}>
        <ul className="flex flex-col gap-6 text-center font-bold tracking-widest text-zinc-800 dark:text-white items-center w-full">
          <li className="cursor-pointer" onClick={() => { setIsMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>HOME</li>
          <li className="cursor-pointer" onClick={() => { setIsMenuOpen(false); document.getElementById('about-section').scrollIntoView({ behavior: 'smooth' }); }}>ABOUT</li>
          <li 
            className="cursor-pointer bg-brand/10 border border-brand text-brand hover:bg-brand hover:text-black px-6 py-3 rounded-full w-max shadow-[0_0_15px_rgba(4,250,58,0.2)] transition-colors" 
            onClick={() => { setIsMenuOpen(false); document.getElementById('workflow-section').scrollIntoView({ behavior: 'smooth' }); }}
          >
            HOW IT WORKS
          </li>
          <li className="cursor-pointer" onClick={() => { setIsMenuOpen(false); document.getElementById('team-section').scrollIntoView({ behavior: 'smooth' }); }}>TEAM</li>
        </ul>
      </div>

      {/* HERO SECTION */}
      <main className="flex flex-col-reverse md:flex-row justify-between items-center mt-12 md:mt-24 gap-10 md:gap-0 z-10 min-h-[60vh]">
        <div className="flex-1 text-center md:text-left">
          <div className="hero-text opacity-0 inline-block px-4 py-1.5 bg-brand/10 border border-brand/20 rounded-full text-brand text-[10px] font-bold tracking-[0.3em] mb-6 uppercase">
            Colosseum Frontier Hackathon 2026
          </div>
          
          <h1 className="hero-text opacity-0 text-5xl md:text-7xl font-black tracking-tighter leading-[0.95] mb-6 text-zinc-900 dark:text-white transition-colors duration-500">
            BRIDGING <span className="text-purple-600 dark:text-purple-500">SOLANA</span><br/>
            TO THE <span className="text-brand">REAL WORLD</span>.
          </h1>
          
          <p className="hero-text opacity-0 text-base md:text-lg text-zinc-600 dark:text-zinc-400 max-w-xl mb-8 leading-relaxed mx-auto md:mx-0 transition-colors duration-500">
            Pay any Indonesian QRIS merchant instantly using your Phantom wallet. Zero centralized exchange friction.
          </p>
          
          {/* CTA & Ticker Container */}
          <div className="hero-text opacity-0 flex flex-col sm:flex-row items-center md:items-start justify-center md:justify-start gap-4 mb-4">
            
            {/* CTA BUTTON: LAUNCH APP */}
            <button 
              onClick={handleOpenApp}
              className="bg-brand text-black font-black tracking-widest uppercase px-8 py-3 rounded-full shadow-[0_0_20px_rgba(4,250,58,0.4)] hover:shadow-[0_0_30px_rgba(4,250,58,0.6)] hover:scale-105 transition-all duration-300"
            >
              Launch App
            </button>

            {/* PYTH RATE TICKER */}
            <div className="inline-flex items-center gap-4 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border border-zinc-200 dark:border-white/10 rounded-full p-2 pr-6 shadow-[0_10px_30px_rgba(0,0,0,0.05)] dark:shadow-[0_0_30px_rgba(4,250,58,0.15)] transition-colors duration-500">
              <div className="bg-zinc-100 dark:bg-zinc-800 rounded-full p-2.5 flex items-center justify-center border border-zinc-200 dark:border-white/5 transition-colors duration-500">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand"></span>
                </span>
              </div>
              
              <div className="flex items-center gap-2 text-sm">
                <span className="hidden md:inline text-zinc-400 dark:text-zinc-500 font-bold tracking-widest uppercase text-[10px] mr-1">Pyth Rate</span>
                <span className="font-bold text-zinc-800 dark:text-white flex items-center gap-1 transition-colors duration-500">
                  <span className="w-4 h-4 rounded-full bg-linear-to-tr from-[#9945FF] to-[#14F195] inline-block"></span> 1 SOL
                </span>
                <span className="text-zinc-400 dark:text-zinc-600">=</span>
                <span className="font-black text-brand tracking-wide">
                  {solPrice ? `Rp ${solPrice.toLocaleString('id-ID')}` : 'Loading...'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex justify-center md:justify-end w-full">
          <svg className="logo-konek w-60 md:w-87.5 h-auto drop-shadow-[0_20px_40px_rgba(4,250,58,0.2)] dark:drop-shadow-[0_0_60px_rgba(4,250,58,0.15)]" viewBox="0 0 100 100">
            <path stroke="var(--color-brand)" strokeWidth="14" fill="none" strokeLinecap="round" strokeLinejoin="round" d="M 10 85 L 35 15 L 55 35" />
            <path stroke="var(--color-brand)" strokeWidth="14" fill="none" strokeLinecap="round" strokeLinejoin="round" d="M 90 15 L 65 85 L 45 65" />
          </svg>
        </div>
      </main>

      {/* ABOUT KONEK SECTION */}
      <section id="about-section" className="scroll-mt-32 md:scroll-mt-40 mt-32 md:mt-48 pb-10 z-10 w-full max-w-6xl mx-auto flex flex-col items-center">
        <div className="text-center mb-12 scroll-animate opacity-0">
          <h2 className="text-3xl md:text-5xl font-black tracking-widest mb-6 text-zinc-900 dark:text-white transition-colors duration-500">ABOUT <span className="text-brand">KONEK</span></h2>
          <p className="text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto text-lg leading-relaxed transition-colors duration-500">
            KONEK adalah jembatan pembayaran masa depan yang menghubungkan ekosistem Web3 dengan ekonomi dunia nyata. Membayar apapun kini semudah memindai QRIS menggunakan dompet kripto Anda.
          </p>
        </div>

        <div className="w-full bg-white/60 dark:bg-zinc-800/40 border border-zinc-200 dark:border-white/10 rounded-[2.5rem] p-8 md:p-14 backdrop-blur-sm relative overflow-hidden my-12 scroll-animate opacity-0 transition-colors duration-500 shadow-xl dark:shadow-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-75 h-75 bg-brand/20 dark:bg-brand/10 blur-[100px] rounded-full pointer-events-none"></div>
          <p className="text-center text-[10px] uppercase tracking-[0.4em] text-zinc-400 dark:text-zinc-500 font-bold mb-10 relative z-10 transition-colors duration-500">
            Didukung Oleh Jaringan Global & Lokal
          </p>
          <div className="flex flex-wrap justify-center items-center gap-10 md:gap-16 relative z-10">
            <img src={logoSolana} alt="Solana Logo" className="h-10 md:h-14 object-contain" />
            <img src={logoPhantom} alt="Phantom Wallet Logo" className="h-10 md:h-14 object-contain" />
            <img src={logoMidtrans} alt="Midtrans Logo" className="h-16 md:h-24 object-contain" />
          </div>
        </div>
      </section>

      {/* HOW IT WORKS SECTION */}
      <section id="workflow-section" className="scroll-mt-32 mt-20 md:mt-32 z-10 w-full max-w-6xl mx-auto px-4">
        <div className="text-center mb-16 scroll-animate opacity-0">
          <h2 className="text-3xl md:text-5xl font-black tracking-widest mb-4 text-zinc-900 dark:text-white transition-colors">HOW IT <span className="text-brand">WORKS</span></h2>
          <p className="text-zinc-500 dark:text-zinc-400 font-bold tracking-widest text-xs uppercase transition-colors">3 Simple Steps for Web3 Transactions</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { step: "01", title: "CONNECT WALLET", desc: "Connect Phantom Wallet." },
            { step: "02", title: "SCAN QRIS", desc: "Scan any standard QRIS code." },
            { step: "03", title: "SIGN & PAY", desc: "Sign the transaction. Merchant receives IDR instantly via Midtrans." }
          ].map((item, i) => (
            <div key={i} className="scroll-animate opacity-0 bg-white/50 dark:bg-zinc-800/30 border border-zinc-200 dark:border-white/10 p-8 rounded-[2.5rem] relative overflow-hidden group hover:border-brand transition-all duration-500 shadow-xl dark:shadow-none">
              <div className="text-7xl font-black text-brand/10 dark:text-brand/5 absolute -top-2 -right-2 group-hover:text-brand/20 transition-colors pointer-events-none">
                {item.step}
              </div>
              <div className="relative z-10">
                <div className="w-14 h-14 bg-brand dark:bg-brand/20 rounded-2xl flex items-center justify-center text-black dark:text-brand font-black mb-6 shadow-[0_0_20px_rgba(4,250,58,0.3)] dark:shadow-none transition-colors">
                  {item.step}
                </div>
                <h3 className="text-xl font-black mb-4 tracking-tighter text-zinc-900 dark:text-white transition-colors">{item.title}</h3>
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed text-sm transition-colors">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* TEAM SECTION */}
      <section id="team-section" className="creator-section scroll-mt-32 md:scroll-mt-40 opacity-0 mt-20 mb-32 z-10 w-full max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-10 bg-white/80 dark:bg-zinc-900/60 p-8 md:p-14 rounded-[3rem] border border-zinc-200 dark:border-white/5 shadow-2xl relative overflow-hidden transition-colors duration-500">
        <div className="flex-1 relative w-full h-87.5 md:h-112.5 flex items-center justify-center md:justify-start md:pl-16 perspective-1000 cursor-grab active:cursor-grabbing" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <div className="relative w-full h-62.5 flex items-center justify-center md:justify-start">
            {teamMembers.map((member, index) => {
              const position = (index - activeIdx + teamMembers.length) % teamMembers.length;
              let transformClass = "", zIndexClass = "", opacityClass = "";

              if (position === 0) { transformClass = "translate-x-0 translate-y-0 scale-100 rotate-0"; zIndexClass = "z-30"; opacityClass = "opacity-100"; }
              else if (position === 1) { transformClass = "translate-x-[60px] md:translate-x-[110px] translate-y-[30px] md:translate-y-[40px] scale-75 md:scale-90 rotate-12"; zIndexClass = "z-20"; opacityClass = "opacity-60"; }
              else if (position === 2) { transformClass = "-translate-x-[60px] md:-translate-x-[110px] -translate-y-[20px] md:-translate-y-[30px] scale-75 md:scale-90 -rotate-[15deg]"; zIndexClass = "z-10"; opacityClass = "opacity-40"; }

              return (
                <div key={member.id} onClick={() => setActiveIdx(index)} className={`absolute w-48 h-70 md:w-64 md:h-95 transition-all duration-800 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${transformClass} ${zIndexClass} ${opacityClass}`}>
                  <div className={`w-full h-full rounded-2xl md:rounded-4xl flex items-center justify-center border-2 border-white/50 dark:border-white/10 hover:border-white transition-colors ${member.bgClass} ${position === 0 ? member.shadowClass : 'shadow-[0_20px_40px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_40px_rgba(0,0,0,0.8)]'} overflow-hidden`} style={{ animation: 'custom-float 6s ease-in-out infinite', animationDelay: `${index * 1.2}s` }}>
                    <img src={member.photo} alt={member.name} className="w-full h-full object-cover pointer-events-none" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div key={activeIdx} className="flex-1 text-center md:text-left mt-16 md:mt-0 relative z-40 animate-fade-in">
          <div className="inline-block px-4 py-1.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 rounded-full text-zinc-500 dark:text-zinc-400 text-[10px] font-bold tracking-[0.3em] mb-4 uppercase transition-colors duration-500">
            Core Team
          </div>
          <h2 className="text-3xl md:text-5xl font-black tracking-widest text-zinc-900 dark:text-white mb-2 transition-colors duration-500">
            {teamMembers[activeIdx].name}
          </h2>
          <h3 className="text-xl font-bold text-brand mb-6 tracking-wider">
            {teamMembers[activeIdx].role}
          </h3>
          <p className="text-zinc-600 dark:text-zinc-400 text-lg leading-relaxed mb-8 max-w-lg mx-auto md:mx-0 transition-colors duration-500">
            {teamMembers[activeIdx].desc}
          </p>
          <div className="flex flex-wrap gap-3 justify-center md:justify-start">
            {teamMembers[activeIdx].tags.map((tag, i) => (
              <span key={i} className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-full text-[10px] md:text-xs font-bold tracking-widest text-zinc-600 dark:text-zinc-300 transition-colors duration-500">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-12 flex flex-col items-center justify-center gap-4 text-center text-zinc-400 dark:text-zinc-600 text-[10px] tracking-[0.2em] font-bold uppercase border-t border-zinc-200 dark:border-white/5 pb-32 transition-colors duration-500">
        <div className="flex items-center gap-2 mb-2 opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-300 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <svg viewBox="0 0 100 100" className="w-6 h-6">
             <path stroke="var(--color-brand)" strokeWidth="14" fill="none" strokeLinecap="round" strokeLinejoin="round" d="M 10 85 L 35 15 L 55 35" />
             <path stroke="var(--color-brand)" strokeWidth="14" fill="none" strokeLinecap="round" strokeLinejoin="round" d="M 90 15 L 65 85 L 45 65" />
          </svg>
          <span className="text-sm font-extrabold tracking-widest text-black dark:text-white">Konek<span className="text-brand">Pay</span></span>
        </div>
        <p>Built for Colosseum Frontier Hackathon 2026 x Superteam Indonesia</p>
      </footer>

      {/* FLOATING ACTION BUTTON (QRIS PAY) */}
      <button 
        onClick={handleOpenApp}
        className="fixed bottom-8 right-8 md:bottom-12 md:right-12 z-50 bg-brand text-black px-6 py-4 md:px-8 md:py-5 rounded-full font-black text-lg md:text-xl shadow-[0_10px_30px_rgba(4,250,58,0.4)] dark:shadow-[0_0_30px_rgba(4,250,58,0.5)] hover:scale-110 hover:shadow-[0_15px_40px_rgba(4,250,58,0.6)] dark:hover:shadow-[0_0_50px_rgba(4,250,58,0.8)] transition-all flex items-center gap-3 group"
      >
        <svg className="w-6 h-6 md:w-8 md:h-8 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1z"></path>
        </svg>
        QRIS PAY
      </button>


      {/* ========================================================= */}
      {/* KUMPULAN POP-UP / MODAL (LOGIN, SCANNER, PAYMENT) */}
      {/* ========================================================= */}

      {/* 1. POP-UP LOGIN (Tampil kalau belum konek dompet) */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 z-120 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in transition-all">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-[2.5rem] max-w-sm w-full p-8 text-center shadow-2xl relative transition-colors">
            
            <button onClick={() => setIsLoginModalOpen(false)} className="absolute top-6 right-6 text-zinc-400 hover:text-red-500 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>

            <div className="w-24 h-24 bg-purple-500/10 dark:bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(147,51,234,0.3)]">
              <img src={logoPhantom} alt="Phantom" className="w-12 h-12 object-contain" />
            </div>
            
            <h3 className="text-2xl font-black text-zinc-900 dark:text-white mb-2 uppercase tracking-tight">Connect Wallet</h3>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-8 leading-relaxed">
              Hubungkan Phantom Wallet kamu untuk mulai membayar pakai Solana.
            </p>
            
            <button 
              onClick={handleConnectWallet}
              className="w-full bg-[#AB9FF2] text-zinc-900 font-black tracking-widest uppercase py-4 rounded-2xl shadow-lg hover:scale-105 transition-all flex justify-center items-center gap-3"
            >
              Connect Phantom
            </button>
          </div>
        </div>
      )}

      {/* 2. POP-UP SCANNER (Tampil kalau udah login dan pencet QRIS PAY) */}
      {isScannerOpen && (
        <QrisScanner 
          onClose={() => setIsScannerOpen(false)} 
          onResult={(data) => {
            setScannedData(data); // Simpan hasil scan
            setIsScannerOpen(false); // Tutup scanner otomatis
          }} 
        />
      )}

      {/* 3. POP-UP PAYMENT (Tampil kalau scanner berhasil nangkep QR) */}
      {scannedData && (
        <PaymentPage 
          qrisData={scannedData}
          solPrice={solPrice}
          onCancel={() => setScannedData(null)}
          onConfirm={async () => {
            // Ini akan dipanggil oleh PaymentPage saat tombol Confirm diklik
            console.log("Mengeksekusi Transaksi di Blockchain...");
            // TODO: Nanti backend panggil window.solana.signTransaction di sini
          }}
        />
      )}

    </div>
  );
}

export default App;
