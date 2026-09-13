import React, { useEffect } from 'react';
import {
  ShieldCheck, MapPin, TrendingUp, GraduationCap,
  CheckCircle, Users, Zap, ChevronRight, Smartphone
} from 'lucide-react';

const LandingPage = ({ onGetStarted }) => {
  useEffect(() => {
    document.body.classList.remove('light-theme');
  }, []);

  const features = [
    {
      icon: <CheckCircle size={28} />,
      title: 'Smart Attendance',
      desc: 'Real-time tracking with automated calculations, defaulter alerts, and comprehensive NAAC-compliant reporting system.',
      variant: 'navy',
    },
    {
      icon: <ShieldCheck size={28} />,
      title: 'Anti-Proxy Protection',
      desc: 'Combines real-time location mapping with dynamic timed OTPs & 15-second rotating QR codes to stop proxy attempts.',
      variant: 'amber',
    },
    {
      icon: <TrendingUp size={28} />,
      title: 'Advanced Analytics',
      desc: 'Deep insights into student performance, attendance patterns, and institutional metrics with beautiful visualizations.',
      variant: 'dark',
    },
    {
      icon: <MapPin size={28} />,
      title: 'Geofencing Validation',
      desc: 'Ensures students are physically present in the classroom radius before marking attendance using high-accuracy geolocation APIs.',
      variant: 'dark',
    },
    {
      icon: <Users size={28} />,
      title: 'Multi-Role Access',
      desc: 'Tailored dashboards for administrators, faculty, and students with personalized workflows and permissions.',
      variant: 'amber',
    },
    {
      icon: <Zap size={28} />,
      title: 'Lightning Fast',
      desc: 'Optimized performance with instant search, quick filters, and responsive design for seamless user experience.',
      variant: 'navy',
    },
  ];

  const steps = [
    {
      num: '1',
      title: 'Faculty Starts Session',
      desc: 'Instructor generates a live QR code and dynamic OTP from their dashboard.',
    },
    {
      num: '2',
      title: 'Student Scans QR',
      desc: 'Students scan the code or enter the OTP via the student portal on their phones.',
    },
    {
      num: '3',
      title: 'GPS Validates',
      desc: 'The system cross-checks the student location. If they are in class, attendance is marked.',
    },
  ];

  return (
    <div style={s.page}>

      {/* HERO SECTION */}
      <section style={s.hero}>
        <div style={s.heroLayout} className="animate-fade-in-up">
          
          {/* Left Hero Text Column */}
          <div style={s.heroTextCol}>
            <div style={s.badge}>
              <Zap size={16} color="#fbbf24" className="spin-slow" />
              <span>Edu<span style={{ color: '#fbbf24' }}>Mark</span> Academic Platform</span>
            </div>

            <div style={s.heroBrandWrap}>
              <div style={s.heroLogoIcon}>
                <GraduationCap size={36} color="#001b3d" />
              </div>
              <h1 style={s.heroTitle}>Edu<span style={{ color: '#fbbf24' }}>Mark</span></h1>
            </div>

            <h2 style={s.heroSubtitle}>
              Transform Academic Management <br />
              <span style={{ color: '#fbbf24' }}>with Intelligence & Security</span>
            </h2>

            <p style={s.heroDesc}>
              The most comprehensive platform for universities to track attendance,
              manage examinations, and analyze student performance with AI-powered insights.
            </p>

            <div style={s.heroBtns}>
              <button style={s.btnPrimary} onClick={onGetStarted} id="landing-get-started-btn">
                Get Started <Zap size={18} color="#c2410c" fill="#ea580c" style={{ display: 'inline-flex', verticalAlign: 'middle' }} />
              </button>
              <button style={s.btnGhost} onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })} id="landing-how-it-works-btn">
                How it Works
              </button>
            </div>

            <div style={s.trustRow}>
              <span style={s.trustItem}><CheckCircle size={15} color="#10b981" /> No Hardware Needed</span>
              <span style={s.trustItem}><CheckCircle size={15} color="#10b981" /> Cloud Synced</span>
              <span style={s.trustItem}><CheckCircle size={15} color="#10b981" /> 100% Anti-Proxy</span>
            </div>
          </div>

          {/* Right Hero Preview Cards Column */}
          <div style={s.heroVisualCol} className="animate-fade-in-up delay-2">
            <div style={s.cardPreview1} className="animate-float">
              <div style={s.previewCardHeader}>
                <Smartphone size={16} color="#fbbf24" />
                <span>Active Session</span>
                <span style={s.livePingDot}></span>
              </div>
              <div style={s.previewCardTitle}>Operating Systems - CS301</div>
              <div style={s.previewCardData}>
                <span style={s.previewCardLabel}>Attendance Rate</span>
                <span style={s.previewCardValue}>84% Present</span>
              </div>
            </div>

            <div style={s.cardPreview2} className="animate-float-delayed">
              <div style={s.previewCardHeader}>
                <MapPin size={16} color="#10b981" />
                <span>GPS Verification</span>
                <span style={{ ...s.livePingDot, backgroundColor: '#10b981' }}></span>
              </div>
              <div style={s.previewCardTitle}>Location Locked</div>
              <div style={s.previewCardData}>
                <span style={s.previewCardLabel}>Distance</span>
                <span style={{ ...s.previewCardValue, color: '#10b981' }}>12m (In Radius)</span>
              </div>
            </div>

            <div style={s.cardPreview3} className="animate-float-more-delayed">
              <div style={s.previewCardHeader}>
                <ShieldCheck size={16} color="#fbbf24" />
                <span>Security Engine</span>
              </div>
              <div style={s.previewCardTitle}>3-Way Verification</div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <span style={s.miniTag}>Live QR</span>
                <span style={s.miniTagSuccess}>GPS Verified</span>
                <span style={s.miniTagAmber}>Dynamic OTP</span>
              </div>
            </div>
          </div>

        </div>

        {/* Stats Row */}
        <div style={s.statsRow} className="animate-fade-in-up delay-3">
          <div style={s.statCard} className="stat-box-hover">
            <div style={s.statNum} className="stat-num-glow">100%</div>
            <div style={s.statLabel}>Proxy Prevention</div>
          </div>
          <div style={s.statCard} className="stat-box-hover">
            <div style={s.statNum} className="stat-num-glow">&#60;&nbsp;5s</div>
            <div style={s.statLabel}>Average Scan Time</div>
          </div>
          <div style={s.statCard} className="stat-box-hover">
            <div style={s.statNum} className="stat-num-glow">NAAC</div>
            <div style={s.statLabel}>Compliant Reports</div>
          </div>
        </div>
      </section>

      {/* FEATURES SECTION (Light Theme background) */}
      <section style={s.featuresSection}>
        <div style={s.sectionHead}>
          <h2 style={s.sectionTitle}>Everything You Need in One Platform</h2>
          <p style={s.sectionSub}>Powerful features designed for modern educational institutions</p>
        </div>
        <div style={s.featuresGrid}>
          {features.map((f, i) => {
            const isAmber = f.variant === 'amber';
            const isDark  = f.variant === 'dark';
            const cardBg  = isAmber ? '#f59e0b' : isDark ? '#1e2a3a' : '#003580';
            const iconBg  = isAmber ? '#001b3d' : '#f59e0b';
            const iconCol = isAmber ? '#f59e0b' : '#001b3d';
            const titleCol = isAmber ? '#001b3d' : '#ffffff';
            const descCol  = isAmber ? 'rgba(0,27,61,0.85)' : 'rgba(255,255,255,0.85)';
            return (
              <div key={i} style={{ ...s.featureCard, background: cardBg }} className={`feature-card-hover variant-${f.variant}`}>
                <div style={{ ...s.featureIconBox, background: iconBg }}>
                  <span style={{ color: iconCol, display: 'flex' }}>{f.icon}</span>
                </div>
                <h3 style={{ ...s.featureCardTitle, color: titleCol }}>{f.title}</h3>
                <p style={{ ...s.featureCardDesc, color: descCol }}>{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* HOW IT WORKS & CTA (Combined in seamless dark background) */}
      <section id="how-it-works" style={s.stepsSection}>
        <div style={s.sectionHead}>
          <h2 style={{ ...s.sectionTitle, color: '#ffffff' }}>3 Simple Steps</h2>
          <p style={{ ...s.sectionSub, color: 'rgba(147,197,253,0.85)' }}>No biometric scanners or ID cards required. Just your smartphone.</p>
        </div>
        <div style={s.stepsGrid}>
          {steps.map((st, i) => (
            <React.Fragment key={i}>
              <div style={s.stepCard}>
                <div style={{ ...s.stepCircle, animationDelay: `${i * 0.8}s` }} className="step-icon-glow">{st.num}</div>
                <h3 style={s.stepTitle}>{st.title}</h3>
                <p style={s.stepDesc}>{st.desc}</p>
              </div>
              {i < steps.length - 1 && <div style={s.stepConnector} />}
            </React.Fragment>
          ))}
        </div>

        {/* CTA CARD (Seamlessly embedded) */}
        <div style={s.ctaContainer}>
          <div style={s.ctaCard} className="shimmer-wrapper">
            <div style={s.ctaBadgeIcon}>
              <GraduationCap size={24} color="#001b3d" />
            </div>
            <h2 style={s.ctaTitle}>Ready to Transform Your Campus Attendance?</h2>
            <p style={s.ctaDesc}>Join the portal now and experience seamless attendance tracking.</p>
            <button style={s.btnPrimary} onClick={onGetStarted} id="landing-cta-btn">
              Login to Portal &nbsp;<ChevronRight size={18} style={{ display: 'inline', verticalAlign: 'middle' }} />
            </button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={s.footer}>
        <div style={s.footerLogo}>
          <div style={s.logoIcon}><GraduationCap size={18} color="#001b3d" /></div>
          <span style={{ ...s.navBrand, fontSize: '1.2rem' }}>Edu<span style={{ color: '#fbbf24' }}>Mark</span></span>
        </div>
        <p style={s.footerText}>&#169; {new Date().getFullYear()} EduMark Smart Attendance System.</p>
        <p style={s.footerCredit}>This Module Built and Designed By <span style={{ color: '#fbbf24' }}>Dabhi Prit And Jadav Dashrath</span></p>
      </footer>
    </div>
  );
};

const s = {
  page: { minHeight: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', system-ui, sans-serif", overflowX: 'hidden' },
  hero: {
    background: 'radial-gradient(ellipse at 50% 0%, #003b7a 0%, #001b3d 55%, #000f24 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '40px 0 80px 0',
    width: '100%',
  },
  heroLayout: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
    gap: '40px',
    width: '100%',
    maxWidth: '1350px',
    padding: '20px 4% 50px 4%',
    alignItems: 'center',
  },
  heroTextCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    textAlign: 'left',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: '99px',
    fontSize: '0.85rem',
    fontWeight: '600',
    color: '#fbbf24',
    background: 'rgba(251, 191, 36, 0.1)',
    marginBottom: '20px',
    border: '1px solid rgba(251, 191, 36, 0.25)',
  },
  heroBrandWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    marginBottom: '16px',
  },
  heroLogoIcon: {
    width: '60px',
    height: '60px',
    borderRadius: '16px',
    background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 6px 20px rgba(251, 191, 36, 0.45)',
    flexShrink: 0,
  },
  heroTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 'clamp(2.5rem, 5vw, 4rem)',
    fontWeight: '800',
    color: '#ffffff',
    margin: 0,
    letterSpacing: '-1.5px',
    lineHeight: '1',
  },
  heroSubtitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 'clamp(1.4rem, 2.5vw, 2.2rem)',
    color: '#ffffff',
    fontWeight: '700',
    lineHeight: '1.25',
    margin: '0 0 16px 0',
    letterSpacing: '-0.5px',
  },
  heroDesc: {
    fontSize: '1.05rem',
    color: 'rgba(147, 197, 253, 0.9)',
    lineHeight: '1.65',
    margin: '0 0 32px 0',
    maxWidth: '580px',
  },
  heroBtns: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '28px',
  },
  btnPrimary: {
    background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
    border: 'none',
    color: '#001b3d',
    fontWeight: '700',
    fontSize: '1rem',
    padding: '14px 32px',
    borderRadius: '12px',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },
  btnGhost: {
    background: 'transparent',
    border: '2px solid rgba(255,255,255,0.25)',
    color: '#ffffff',
    fontWeight: '700',
    fontSize: '1rem',
    padding: '12px 32px',
    borderRadius: '12px',
    cursor: 'pointer',
    backdropFilter: 'blur(4px)',
  },
  trustRow: {
    display: 'flex',
    gap: '20px',
    flexWrap: 'wrap',
    fontSize: '0.88rem',
    color: 'rgba(147, 197, 253, 0.8)',
    fontWeight: '500',
  },
  trustItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  heroVisualCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '40px',
    position: 'relative',
    padding: '10px 0',
  },
  cardPreview1: {
    background: 'rgba(0, 35, 75, 0.65)',
    border: '1px solid rgba(251, 191, 36, 0.35)',
    boxShadow: '0 16px 36px rgba(0, 0, 0, 0.35)',
    padding: '22px 26px',
    borderRadius: '18px',
    backdropFilter: 'blur(12px)',
  },
  cardPreview2: {
    background: 'rgba(0, 35, 75, 0.65)',
    border: '1px solid rgba(16, 185, 129, 0.35)',
    boxShadow: '0 16px 36px rgba(0, 0, 0, 0.35)',
    padding: '22px 26px',
    borderRadius: '18px',
    backdropFilter: 'blur(12px)',
  },
  cardPreview3: {
    background: 'rgba(0, 35, 75, 0.65)',
    border: '1px solid rgba(14, 165, 233, 0.35)',
    boxShadow: '0 16px 36px rgba(0, 0, 0, 0.35)',
    padding: '22px 26px',
    borderRadius: '18px',
    backdropFilter: 'blur(12px)',
  },
  previewCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.82rem',
    color: 'rgba(147, 197, 253, 0.9)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    fontWeight: '600',
    marginBottom: '10px',
  },
  livePingDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#fbbf24',
    marginLeft: 'auto',
  },
  previewCardTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontWeight: '700',
    fontSize: '1.15rem',
    color: '#ffffff',
    marginBottom: '12px',
  },
  previewCardData: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    background: 'rgba(255, 255, 255, 0.06)',
    borderRadius: '10px',
  },
  previewCardLabel: {
    fontSize: '0.85rem',
    color: 'rgba(147, 197, 253, 0.8)',
  },
  previewCardValue: {
    fontSize: '0.9rem',
    fontWeight: '700',
    color: '#ffffff',
  },
  miniTag: {
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '0.78rem',
    background: 'rgba(14, 165, 233, 0.15)',
    color: '#38bdf8',
    fontWeight: '600',
  },
  miniTagSuccess: {
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '0.78rem',
    background: 'rgba(16, 185, 129, 0.15)',
    color: '#10b981',
    fontWeight: '600',
  },
  miniTagAmber: {
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '0.78rem',
    background: 'rgba(251, 191, 36, 0.15)',
    color: '#fbbf24',
    fontWeight: '600',
  },

  statsRow: {
    display: 'flex',
    gap: '24px',
    flexWrap: 'wrap',
    justifyContent: 'center',
    padding: '0 4%',
    width: '100%',
    maxWidth: '1350px',
  },
  statCard: {
    flex: '1 1 260px',
    background: 'rgba(0,35,75,0.65)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '18px',
    padding: '30px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '8px',
    backdropFilter: 'blur(8px)',
  },
  statNum: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '2.6rem',
    fontWeight: '800',
    color: '#fbbf24',
    lineHeight: '1',
  },
  statLabel: {
    fontSize: '0.88rem',
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  featuresSection: {
    background: '#f0f4f8',
    padding: '90px 4%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
  },
  sectionHead: {
    textAlign: 'center',
    marginBottom: '56px',
    maxWidth: '750px',
  },
  sectionTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)',
    fontWeight: '800',
    color: '#002d62',
    margin: '0 0 14px',
    letterSpacing: '-0.5px',
  },
  sectionSub: {
    fontSize: '1.05rem',
    color: '#5a7a9e',
    lineHeight: '1.6',
    margin: 0,
  },
  featuresGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    columnGap: '24px',
    rowGap: '48px',
    width: '100%',
    maxWidth: '1350px',
  },
  featureCard: {
    borderRadius: '20px',
    padding: '36px 30px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    transition: 'transform 0.3s ease, box-shadow 0.3s ease',
  },
  featureIconBox: {
    width: '56px',
    height: '56px',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  featureCardTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '1.25rem',
    fontWeight: '700',
    margin: 0,
  },
  featureCardDesc: {
    fontSize: '0.95rem',
    lineHeight: '1.65',
    margin: 0,
  },
  stepsSection: {
    background: 'radial-gradient(ellipse at 50% 0%, #003b7a 0%, #001b3d 60%, #000f24 100%)',
    padding: '90px 4% 90px 4%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
  },
  stepsGrid: {
    display: 'flex',
    gap: '0',
    alignItems: 'flex-start',
    justifyContent: 'center',
    width: '100%',
    maxWidth: '1200px',
    flexWrap: 'wrap',
  },
  stepCard: {
    flex: '1 1 240px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '16px',
    padding: '0 20px',
  },
  stepCircle: {
    width: '68px',
    height: '68px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.6rem',
    fontWeight: '800',
    color: '#001b3d',
    boxShadow: '0 10px 24px rgba(251,191,36,0.45)',
    flexShrink: 0,
  },
  stepConnector: {
    height: '2px',
    width: '60px',
    minWidth: '40px',
    background: 'rgba(255,255,255,0.15)',
    marginTop: '34px',
    flexShrink: 0,
  },
  stepTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '1.1rem',
    fontWeight: '700',
    color: '#ffffff',
    margin: 0,
  },
  stepDesc: {
    fontSize: '0.9rem',
    color: 'rgba(147,197,253,0.8)',
    lineHeight: '1.6',
    margin: 0,
  },
  ctaContainer: {
    width: '100%',
    maxWidth: '1200px',
    marginTop: '70px',
    display: 'flex',
    justifyContent: 'center',
  },
  ctaCard: {
    width: '100%',
    background: 'linear-gradient(135deg, rgba(0, 59, 122, 0.45) 0%, rgba(0, 27, 61, 0.75) 100%)',
    border: '1px solid rgba(251, 191, 36, 0.35)',
    borderRadius: '24px',
    padding: '50px 36px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '14px',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(12px)',
  },
  ctaBadgeIcon: {
    width: '52px',
    height: '52px',
    borderRadius: '16px',
    background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 6px 18px rgba(251, 191, 36, 0.4)',
    marginBottom: '4px',
  },
  ctaTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 'clamp(1.6rem, 3.2vw, 2.3rem)',
    fontWeight: '800',
    color: '#ffffff',
    margin: 0,
    letterSpacing: '-0.5px',
  },
  ctaDesc: {
    fontSize: '1.05rem',
    color: 'rgba(147, 197, 253, 0.9)',
    margin: '0 0 12px',
    maxWidth: '560px',
  },
  footer: {
    background: '#000f24',
    padding: '40px 4%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    width: '100%',
  },
  footerLogo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '6px',
  },
  footerText: {
    fontSize: '0.9rem',
    color: 'rgba(147,197,253,0.7)',
    margin: 0,
    textAlign: 'center',
  },
  footerCredit: {
    fontSize: '0.88rem',
    color: 'rgba(147,197,253,0.6)',
    margin: 0,
    textAlign: 'center',
  },
  logoIcon: {
    width: '38px',
    height: '38px',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 14px rgba(251,191,36,0.4)',
    flexShrink: 0,
  },
  navBrand: {
    fontFamily: "'Outfit', sans-serif",
    fontWeight: '800',
    fontSize: '1.5rem',
    color: '#ffffff',
    letterSpacing: '-0.5px',
  },
};

export default LandingPage;
