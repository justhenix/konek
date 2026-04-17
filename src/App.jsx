import { useEffect, useRef, useState } from 'react';
import { animate, createScope, stagger, utils } from 'animejs'; 
import './App.css';

// --- IMPORT FOTO TIM KREATOR ---
import fotoAqiel from './assets/AKILRAJAIBLIS.png';
import fotoBudi from './assets/FRESHIFA.png';
import fotoSiti from './assets/HENIX.png';

const teamMembers = [
  {
    id: 1,
    name: "AKILRAJAIBLIS ",
    role: "ROLE",
    desc: "Deskripsi",
    tags: ["ROOLS", "ROOLS", "ROOLS"],
    bgClass: "bg-[#04fa3a]",
    shadowClass: "shadow-[0_0_50px_rgba(4,250,58,0.4)]",
    photo: fotoAqiel, 
  },
  {
    id: 2,
    name: "HENIX",
    role: "Role",
    desc: "Deskripsi",
    tags: ["ROOLS", "ROOLS", "ROOLS"],
    bgClass: "bg-purple-600",
    shadowClass: "shadow-[0_0_50px_rgba(147,51,234,0.4)]",
    photo: fotoBudi, 
  },
  {
    id: 3,
    name: "FRESHIFA",
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

  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  const handleNext = () => setActiveIdx((prev) => (prev + 1) % teamMembers.length);
  const handlePrev = () => setActiveIdx((prev) => (prev - 1 + teamMembers.length) % teamMembers.length);

  useEffect(() => {
    const timer = setInterval(() => {
      handleNext();
    }, 4000); 
    return () => clearInterval(timer);
  }, [activeIdx]);

  const minSwipeDistance = 50;

  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    if (isLeftSwipe) handleNext(); 
    if (isRightSwipe) handlePrev(); 
  };

  const playCreatorAnimation = () => {
    animate('.square', { 
      x: 0, y: 0, scale: 1, rotate: 0, borderRadius: '16px', duration: 10 
    });

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
    <div className="relative min-h-screen flex flex-col p-4 md:p-8 lg:px-20 bg-[#1c1a17] text-white selection:bg-[#04fa3a] selection:text-black" ref={root}>
      
      <style>
        {`
          @keyframes custom-float {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(3deg); }
          }
        `}
      </style>

      {/* NAVBAR STICKY */}
      <nav className="sticky top-6 flex justify-between items-center bg-zinc-800/60 backdrop-blur-xl px-6 py-4 md:px-10 rounded-2xl md:rounded-full border border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.5)] z-50 nav-item opacity-0 transition-all">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 100 100" className="w-8 h-8">
             <path stroke="#04fa3a" strokeWidth="14" fill="none" strokeLinecap="round" strokeLinejoin="round" d="M 10 85 L 35 15 L 55 35" />
             <path stroke="#04fa3a" strokeWidth="14" fill="none" strokeLinecap="round" strokeLinejoin="round" d="M 90 15 L 65 85 L 45 65" />
          </svg>
          <h2 className="text-xl font-extrabold tracking-widest uppercase">Konek<span className="text-[#04fa3a]">Pay</span></h2>
        </div>

        <ul className="hidden md:flex gap-10 text-xs font-bold tracking-widest text-zinc-400 absolute left-1/2 -translate-x-1/2">
          <li className="hover:text-[#04fa3a] cursor-pointer transition-colors" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>BERANDA</li>
          <li className="hover:text-[#04fa3a] cursor-pointer transition-colors" onClick={() => document.getElementById('about-section').scrollIntoView({ behavior: 'smooth' })}>TENTANG</li>
          <li className="hover:text-[#04fa3a] cursor-pointer transition-colors" onClick={() => document.getElementById('team-section').scrollIntoView({ behavior: 'smooth' })}>TIM KAMI</li>
        </ul>

        <div className="hidden md:block w-[120px]"></div>

        {/* --- TOMBOL HAMBURGER BERANIMASI --- */}
        <button 
          className="md:hidden p-2 text-zinc-300 hover:text-[#04fa3a] focus:outline-none transition-colors" 
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          {/* Wadah Garis */}
          <div className="relative w-6 h-5">
            {/* Garis Atas */}
            <span className={`absolute left-0 w-full h-[2px] bg-current transition-all duration-300 ease-in-out ${isMenuOpen ? 'top-1/2 -translate-y-1/2 rotate-45' : 'top-0'}`} />
            
            {/* Garis Tengah */}
            <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-full h-[2px] bg-current transition-all duration-300 ease-in-out ${isMenuOpen ? 'opacity-0 scale-x-0' : 'opacity-100 scale-x-100'}`} />
            
            {/* Garis Bawah */}
            <span className={`absolute left-0 w-full h-[2px] bg-current transition-all duration-300 ease-in-out ${isMenuOpen ? 'top-1/2 -translate-y-1/2 -rotate-45' : 'top-full -translate-y-full'}`} />
          </div>
        </button>
      </nav>

      {/* DROPDOWN MENU MOBILE */}
      <div className={`md:hidden fixed top-24 left-6 right-6 z-40 bg-zinc-800/95 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl transition-all duration-500 ${isMenuOpen ? 'opacity-100 translate-y-0 visible' : 'opacity-0 -translate-y-8 invisible'}`}>
        <ul className="flex flex-col gap-6 text-center font-bold tracking-widest">
          <li onClick={() => { setIsMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>BERANDA</li>
          <li onClick={() => { setIsMenuOpen(false); document.getElementById('about-section').scrollIntoView({ behavior: 'smooth' }); }}>TENTANG</li>
          <li onClick={() => { setIsMenuOpen(false); document.getElementById('team-section').scrollIntoView({ behavior: 'smooth' }); }}>TIM KAMI</li>
        </ul>
      </div>

      {/* HERO SECTION */}
      <main className="flex flex-col-reverse md:flex-row justify-between items-center mt-12 md:mt-24 gap-10 md:gap-0 z-10 min-h-[60vh]">
        <div className="flex-1 text-center md:text-left">
          <div className="hero-text opacity-0 inline-block px-4 py-1.5 bg-[#04fa3a]/10 border border-[#04fa3a]/20 rounded-full text-[#04fa3a] text-[10px] font-bold tracking-[0.3em] mb-6 uppercase">
            Solana Frontier Hackathon 2026
          </div>
          
          <h1 className="hero-text opacity-0 text-5xl md:text-7xl font-black tracking-tighter leading-[0.95] mb-6">
            JAJAN PAKE <span className="text-purple-500">SOLANA</span>,<br/>
            BAYAR PAKE <span className="text-[#04fa3a]">QRIS</span>.
          </h1>
          
          <p className="hero-text opacity-0 text-base md:text-lg text-zinc-400 max-w-xl mb-8 leading-relaxed mx-auto md:mx-0">
            Jembatan instan Web3 ke dunia nyata. Hubungkan Phantom Wallet-mu, scan QRIS warung mana aja, dan merchant langsung terima Rupiah.
          </p>
          
          {/* --- LIVE EXCHANGE RATE TICKER --- */}
          <div className="hero-text opacity-0 flex flex-col md:flex-row items-center md:items-start justify-center md:justify-start gap-4 mb-4">
            <div className="inline-flex items-center gap-4 bg-zinc-900/80 backdrop-blur-md border border-white/10 rounded-full p-2 pr-6 shadow-[0_0_30px_rgba(4,250,58,0.15)]">
              <div className="bg-zinc-800 rounded-full p-2.5 flex items-center justify-center border border-white/5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#04fa3a] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#04fa3a]"></span>
                </span>
              </div>
              
              <div className="flex items-center gap-2 text-sm">
                <span className="hidden md:inline text-zinc-500 font-bold tracking-widest uppercase text-[10px] mr-1">Pyth Rate</span>
                <span className="font-bold text-white flex items-center gap-1">
                  <span className="w-4 h-4 rounded-full bg-gradient-to-tr from-[#9945FF] to-[#14F195] inline-block"></span> 1 SOL
                </span>
                <span className="text-zinc-600">=</span>
                <span className="font-black text-[#04fa3a] tracking-wide">
                  {solPrice ? `Rp ${solPrice.toLocaleString('id-ID')}` : 'Loading...'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex justify-center md:justify-end w-full">
          <svg className="logo-konek w-[240px] md:w-[350px] h-auto drop-shadow-[0_0_60px_rgba(4,250,58,0.15)]" viewBox="0 0 100 100">
            <path stroke="#04fa3a" strokeWidth="14" fill="none" strokeLinecap="round" strokeLinejoin="round" d="M 10 85 L 35 15 L 55 35" />
            <path stroke="#04fa3a" strokeWidth="14" fill="none" strokeLinecap="round" strokeLinejoin="round" d="M 90 15 L 65 85 L 45 65" />
          </svg>
        </div>
      </main>

      {/* ABOUT KONEK SECTION */}
      <section id="about-section" className="scroll-mt-32 md:scroll-mt-40 mt-32 md:mt-48 pb-10 z-10 w-full max-w-6xl mx-auto flex flex-col items-center">
        <div className="text-center mb-12 scroll-animate opacity-0">
          <h2 className="text-3xl md:text-5xl font-black tracking-widest mb-6">TENTANG <span className="text-[#04fa3a]">KONEK</span></h2>
          <p className="text-zinc-400 max-w-2xl mx-auto text-lg leading-relaxed">
            KONEK adalah jembatan pembayaran masa depan yang menghubungkan ekosistem Web3 dengan ekonomi dunia nyata. Membayar apapun kini semudah memindai QRIS menggunakan dompet kripto Anda.
          </p>
        </div>

        <div className="w-full bg-zinc-800/40 border border-white/10 rounded-[2.5rem] p-8 md:p-14 backdrop-blur-sm relative overflow-hidden my-12 scroll-animate opacity-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-[#04fa3a]/10 blur-[100px] rounded-full pointer-events-none"></div>
          <p className="text-center text-[10px] uppercase tracking-[0.4em] text-zinc-500 font-bold mb-10 relative z-10">
            Didukung Oleh Jaringan Global & Lokal
          </p>
          <div className="flex flex-wrap justify-center items-center gap-10 md:gap-20 opacity-70 hover:opacity-100 grayscale hover:grayscale-0 transition-all duration-500 relative z-10">
            <div className="flex items-center gap-3 font-bold text-xl md:text-2xl tracking-widest">
               <span className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-gradient-to-tr from-[#9945FF] to-[#14F195]"></span> SOLANA
            </div>
            <div className="font-black text-3xl md:text-4xl tracking-tighter text-white">QRIS</div>
            <div className="flex items-center gap-3 font-bold text-xl md:text-2xl tracking-widest">
              <span className="text-2xl md:text-3xl">👻</span> PHANTOM
            </div>
            <div className="font-black text-xl md:text-2xl tracking-[0.2em] text-white">MIDTRANS</div>
          </div>
        </div>
      </section>

      {/* TEAM SECTION (SWIPE + AUTO PLAY) */}
      <section 
        id="team-section" 
        className="creator-section scroll-mt-32 md:scroll-mt-40 opacity-0 mt-20 mb-32 z-10 w-full max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-10 bg-zinc-900/60 p-8 md:p-14 rounded-[3rem] border border-white/5 shadow-2xl relative overflow-hidden"
      >
        {/* AREA TUMPUKAN KOTAK BERHAMBURAN dengan event Swipe */}
        <div 
          className="flex-1 relative w-full h-[350px] md:h-[450px] flex items-center justify-center md:justify-start md:pl-16 perspective-1000 cursor-grab active:cursor-grabbing"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="relative w-full h-[250px] flex items-center justify-center md:justify-start">
            {teamMembers.map((member, index) => {
              const position = (index - activeIdx + teamMembers.length) % teamMembers.length;
              
              let transformClass = "";
              let zIndexClass = "";
              let opacityClass = "";

              if (position === 0) {
                transformClass = "translate-x-0 translate-y-0 scale-100 rotate-0";
                zIndexClass = "z-30";
                opacityClass = "opacity-100";
              } else if (position === 1) {
                transformClass = "translate-x-[60px] md:translate-x-[110px] translate-y-[30px] md:translate-y-[40px] scale-75 md:scale-90 rotate-12";
                zIndexClass = "z-20";
                opacityClass = "opacity-60";
              } else if (position === 2) {
                transformClass = "-translate-x-[60px] md:-translate-x-[110px] -translate-y-[20px] md:-translate-y-[30px] scale-75 md:scale-90 -rotate-[15deg]";
                zIndexClass = "z-10";
                opacityClass = "opacity-40";
              }

              return (
                <div
                  key={member.id}
                  onClick={() => setActiveIdx(index)}
                  className={`absolute w-48 h-[280px] md:w-64 md:h-[380px] transition-all duration-[800ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] ${transformClass} ${zIndexClass} ${opacityClass}`}
                >
                  <div 
                    className={`w-full h-full rounded-2xl md:rounded-[2rem] flex items-center justify-center border-2 border-white/10 hover:border-white/50 transition-colors ${member.bgClass} ${position === 0 ? member.shadowClass : 'shadow-[0_20px_40px_rgba(0,0,0,0.8)]'} overflow-hidden`}
                    style={{ animation: 'custom-float 6s ease-in-out infinite', animationDelay: `${index * 1.2}s` }}
                  >
                    <img src={member.photo} alt={member.name} className="w-full h-full object-cover pointer-events-none" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* INFO DINAMIS */}
        <div key={activeIdx} className="flex-1 text-center md:text-left mt-16 md:mt-0 relative z-40 animate-fade-in">
          <div className="inline-block px-4 py-1.5 bg-zinc-800 border border-white/10 rounded-full text-zinc-400 text-[10px] font-bold tracking-[0.3em] mb-4 uppercase">
            Tim Inti
          </div>
          <h2 className="text-3xl md:text-5xl font-black tracking-widest text-white mb-2">
            {teamMembers[activeIdx].name}
          </h2>
          <h3 className="text-xl font-bold text-[#04fa3a] mb-6 tracking-wider">
            {teamMembers[activeIdx].role}
          </h3>
          <p className="text-zinc-400 text-lg leading-relaxed mb-8 max-w-lg mx-auto md:mx-0">
            {teamMembers[activeIdx].desc}
          </p>
          <div className="flex flex-wrap gap-3 justify-center md:justify-start">
            {teamMembers[activeIdx].tags.map((tag, i) => (
              <span key={i} className="px-4 py-2 bg-zinc-800/50 border border-white/10 rounded-full text-[10px] md:text-xs font-bold tracking-widest text-zinc-300">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-12 text-center text-zinc-600 text-[10px] tracking-[0.4em] font-bold uppercase border-t border-white/5 pb-32">
        Powered by Solana — Pyth — Midtrans — Dev by Aqiel
      </footer>

      {/* FLOATING ACTION BUTTON (QRIS PAY) */}
      <button className="fixed bottom-8 right-8 md:bottom-12 md:right-12 z-50 bg-[#04fa3a] text-black px-6 py-4 md:px-8 md:py-5 rounded-full font-black text-lg md:text-xl shadow-[0_0_30px_rgba(4,250,58,0.5)] hover:scale-110 hover:shadow-[0_0_50px_rgba(4,250,58,0.8)] transition-all flex items-center gap-3 group">
        <svg className="w-6 h-6 md:w-8 md:h-8 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1z"></path>
        </svg>
        QRIS PAY
      </button>

    </div>
  );
}

export default App;