import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, MapPin, Smartphone, ChevronRight, Zap, 
  CheckCircle2, Users, Lock, TrendingUp, Moon, Sun, GraduationCap
} from 'lucide-react';

const LandingPage = ({ onGetStarted }) => {
  useEffect(() => {
    document.body.classList.remove('light-theme');
  }, []);

  return (
    <div style={styles.container}>
      {/* Background Decorators with Morphing Animations */}
      <div style={styles.abstractBlob1} className="animate-orb-pulse"></div>
      <div style={styles.abstractBlob2} className="animate-orb-pulse delay-2"></div>

      {/* Navbar/Header */}
      <header style={styles.header} className="animate-fade-in-up landing-top-header">
        <div className="landing-logo-container" style={styles.logoContainer}>
          <div style={{
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            borderRadius: '12px',
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(245, 158, 11, 0.4)'
          }}>
            <GraduationCap size={26} color="#001b3d" />
          </div>
          <h1 style={styles.logoText}>Edu<span style={{color: '#f59e0b'}}>Mark</span></h1>
        </div>
        <div className="landing-header-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn" style={styles.ghostBtn} onClick={() => {
            document.getElementById('how-it-works').scrollIntoView({ behavior: 'smooth' });
          }}>
            How it Works
          </button>
          <button className="btn btn-primary landing-login-btn" onClick={onGetStarted}>
            Sign In Portal
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main style={styles.main}>
        <div className="hero-layout" style={styles.heroLayoutBase}>
          
          {/* Left Text Content */}
          <div style={styles.heroTextContent} className="animate-fade-in-up delay-1">
            <div style={styles.badge} className="edumark-badge">
              <Zap size={16} color="#f59e0b" className="spin-slow" />
              <span>EduMark Academic Management Platform</span>
            </div>
            
            <h2 style={styles.heroTitle}>
              Transform Academic Management <br />
              <span style={{ color: '#f59e0b' }}>with Intelligence & Security</span>
            </h2>
            
            <p style={styles.heroSubtitle}>
              The most comprehensive platform for universities to track attendance, manage 
              examinations, and analyze student performance with AI-powered insights.
            </p>
            
            <div style={styles.actionGroup}>
              <button className="btn btn-primary pulse-primary" onClick={onGetStarted} style={styles.primaryAction}>
                Enter the Portal
                <ChevronRight size={20} />
              </button>
              <div style={styles.trustMarks}>
                <span style={styles.trustItem}><CheckCircle2 size={16} color="var(--success)"/> No Hardware Needed</span>
                <span style={styles.trustItem}><CheckCircle2 size={16} color="var(--success)"/> Cloud Synced</span>
              </div>
            </div>
          </div>

          {/* Right Visual Element with Floating Cards & Live Animations */}
          <div style={styles.heroVisualContent} className="hero-visual-content animate-fade-in-up delay-2">
            <div className="glass-panel animate-float shimmer-wrapper hero-floating-card hero-card-1" style={styles.floatingCard1}>
              <div style={styles.cardMiniHeader}>
                <Smartphone size={16} color="var(--primary)"/> 
                <span>Active Session</span>
                <span className="live-ping-container" style={{ marginLeft: 'auto' }}>
                  <span className="live-ping-ring"></span>
                  <span className="live-ping-dot"></span>
                </span>
              </div>
              <div style={styles.cardMiniTitle}>Operating Systems - CS301</div>
              <div style={styles.cardMiniData}>
                <span style={styles.dataLabel}>Attendance</span>
                <span style={styles.dataValue}>84% Present</span>
              </div>
            </div>

            <div className="glass-panel animate-float-delayed shimmer-wrapper hero-floating-card hero-card-2" style={styles.floatingCard2}>
              <div style={styles.cardMiniHeader}>
                <MapPin size={16} color="var(--success)"/> 
                <span>GPS Verification</span>
                <span className="live-ping-container" style={{ marginLeft: 'auto' }}>
                  <span className="live-ping-ring" style={{ backgroundColor: '#10b981' }}></span>
                  <span className="live-ping-dot" style={{ backgroundColor: '#10b981' }}></span>
                </span>
              </div>
              <div style={styles.cardMiniTitle}>Location Locked</div>
              <div style={styles.cardMiniData}>
                <span style={styles.dataLabel}>Distance</span>
                <span style={{...styles.dataValue, color: 'var(--success)'}}>12m (In Range)</span>
              </div>
            </div>

            <div className="glass-panel animate-float-reverse shimmer-wrapper hero-floating-card hero-card-3" style={styles.floatingCard3}>
              <div style={styles.cardMiniHeader}>
                <ShieldCheck size={16} color="var(--accent)"/> Dynamic OTP
              </div>
              <div style={styles.cardMiniTitle}>3-Way Verification</div>
              <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                <span style={styles.miniBadge}>Live Scan</span>
                <span style={styles.miniBadgeSuccess}>Verified</span>
              </div>
            </div>
            
            <div style={styles.glowingOrb} className="animate-orb-pulse"></div>
          </div>
        </div>

        {/* Stats Banner */}
        <div className="glass-panel shimmer-wrapper animate-fade-in-up delay-3" style={styles.statsBanner}>
          <div style={styles.statBox} className="stat-box-hover">
            <div style={styles.statNum} className="stat-num-glow">100%</div>
            <div style={styles.statDesc}>Proxy Prevention</div>
          </div>
          <div style={styles.statDivider}></div>
          <div style={styles.statBox} className="stat-box-hover">
            <div style={styles.statNum} className="stat-num-glow">&lt; 5s</div>
            <div style={styles.statDesc}>Average Scan Time</div>
          </div>
          <div style={styles.statDivider}></div>
          <div style={styles.statBox} className="stat-box-hover">
            <div style={styles.statNum} className="stat-num-glow">Zero</div>
            <div style={styles.statDesc}>Hardware Cost</div>
          </div>
        </div>

        {/* How it Works Section */}
        <section id="how-it-works" style={styles.howItWorksSection} className="animate-fade-in-up delay-4">
          <div style={styles.sectionHeader}>
            <h3 style={styles.sectionTitle}>3 Simple Steps</h3>
            <p style={styles.sectionSubtitle}>No biometric scanners or ID cards required. Just your smartphone.</p>
          </div>
          
          <div className="steps-grid" style={styles.stepsGridBase}>
            <div style={styles.stepItem}>
              <div style={styles.stepIconWrapper} className="step-icon-glow">1</div>
              <h4 style={styles.stepTitle}>Faculty Starts Session</h4>
              <p style={styles.stepDesc}>Instructor generates a live QR code and dynamic OTP from their dashboard.</p>
            </div>
            <div style={styles.stepConnector}></div>
            <div style={styles.stepItem}>
              <div style={{ ...styles.stepIconWrapper, animationDelay: '1s' }} className="step-icon-glow">2</div>
              <h4 style={styles.stepTitle}>Student Scans QR</h4>
              <p style={styles.stepDesc}>Students scan the code or enter the OTP via the student portal on their phones.</p>
            </div>
            <div style={styles.stepConnector}></div>
            <div style={styles.stepItem}>
              <div style={{ ...styles.stepIconWrapper, animationDelay: '2s' }} className="step-icon-glow">3</div>
              <h4 style={styles.stepTitle}>GPS Validates</h4>
              <p style={styles.stepDesc}>The system cross-checks the student's location. If they are in class, attendance is marked.</p>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>Why EduMark?</h3>
        </div>
        <div style={styles.featuresGrid}>
          <div className="glass-panel feature-card-hover shimmer-wrapper" style={styles.featureCard}>
            <div style={{...styles.iconWrapper, background: 'rgba(147, 51, 234, 0.15)', color: 'var(--primary)'}} className="feature-icon-wrapper">
              <MapPin size={28} />
            </div>
            <h3 style={styles.featureTitle}>Geofencing Validation</h3>
            <p style={styles.featureDesc}>Ensures students are physically present in the classroom radius before marking attendance. Uses high-accuracy browser geolocation APIs.</p>
          </div>

          <div className="glass-panel feature-card-hover shimmer-wrapper" style={styles.featureCard}>
            <div style={{...styles.iconWrapper, background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)'}} className="feature-icon-wrapper">
              <ShieldCheck size={28} />
            </div>
            <h3 style={styles.featureTitle}>Anti-Proxy Protection</h3>
            <p style={styles.featureDesc}>Combines real-time location mapping with dynamic timed OTPs & 15-second rotating QR codes to stop proxy attempts.</p>
          </div>

          <div className="glass-panel feature-card-hover shimmer-wrapper" style={styles.featureCard}>
            <div style={{...styles.iconWrapper, background: 'rgba(14, 165, 233, 0.15)', color: 'var(--accent)'}} className="feature-icon-wrapper">
              <TrendingUp size={28} />
            </div>
            <h3 style={styles.featureTitle}>Instant Analytics</h3>
            <p style={styles.featureDesc}>Provides real-time dashboards for admins and faculty with auto-calculated student attendance percentages and exportable reports.</p>
          </div>
        </div>
        
        {/* Bottom CTA Banner */}
        <div className="glass-panel shimmer-wrapper animate-fade-in-up" style={styles.ctaBanner}>
          <div>
            <h3 style={styles.ctaTitle}>Ready to Transform Your Campus Attendance?</h3>
            <p style={styles.ctaDesc}>Join the portal now and experience seamless attendance tracking.</p>
          </div>
          <button className="btn btn-primary pulse-primary" onClick={onGetStarted} style={styles.ctaButton}>
            Login to Portal <ChevronRight size={20} />
          </button>
        </div>
      </main>

      
      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.logoContainer}>
          <div style={{
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            borderRadius: '10px',
            padding: '6px 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)'
          }}>
            <GraduationCap size={20} color="#001b3d" />
          </div>
          <span style={{ ...styles.logoText, fontSize: '1.4rem' }}>
            Edu<span style={{ color: '#f59e0b' }}>Mark</span>
          </span>
        </div>
        <p style={{ marginTop: '10px', fontSize: '0.9rem', color: '#93c5fd' }}>
          © {new Date().getFullYear()} EduMark Academic Management System.
        </p>
        <p style={{ marginTop: '6px', fontSize: '0.88rem', fontWeight: '700', color: '#f59e0b', letterSpacing: '0.02em' }}>
          This Module Built and Designed By Dabhi Prit And Jadav Dashrath
        </p>
      </footer>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    width: '100vw',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflowX: 'hidden'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 5%',
    position: 'relative',
    zIndex: 10,
    flexWrap: 'wrap',
    gap: '12px'
  },
  logoContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  logoIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  logoText: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.6rem',
    fontWeight: '800',
    letterSpacing: '-0.5px'
  },
  ghostBtn: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontWeight: '500',
    display: 'none' // Hidden on mobile, handled in media queries optionally, but inline let's just keep it simple. Actually, we'll show it.
  },
  loginBtn: {
    padding: '7px 16px',
    borderRadius: '99px',
    fontSize: '0.85rem',
    fontWeight: '600',
    background: '#2563eb',
    color: '#ffffff',
    border: 'none',
    boxShadow: '0 4px 14px rgba(37, 99, 235, 0.45)',
    transition: 'all 0.3s ease',
    cursor: 'pointer'
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '60px 5% 100px 5%',
    position: 'relative',
    zIndex: 5
  },
  heroLayoutBase: {
    gap: '40px',
    width: '100%',
    maxWidth: '1200px',
    alignItems: 'center',
    marginBottom: '80px'
  },
  heroTextContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    textAlign: 'left'
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: '99px',
    fontSize: '0.85rem',
    fontWeight: '600',
    color: 'var(--primary)',
    background: 'rgba(147, 51, 234, 0.1)',
    marginBottom: '24px',
    border: '1px solid rgba(147, 51, 234, 0.2)'
  },
  heroTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(2.5rem, 5vw, 4.2rem)',
    fontWeight: '800',
    lineHeight: '1.1',
    marginBottom: '24px',
    letterSpacing: '-1px'
  },
  gradientText: {
    background: 'linear-gradient(135deg, var(--primary) 0%, #0ea5e9 50%, var(--primary) 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    display: 'inline-block'
  },
  heroSubtitle: {
    fontSize: '1.1rem',
    color: 'var(--text-secondary)',
    lineHeight: '1.6',
    maxWidth: '540px',
    marginBottom: '40px'
  },
  actionGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    alignItems: 'flex-start'
  },
  primaryAction: {
    padding: '16px 36px',
    fontSize: '1.1rem',
    borderRadius: '99px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  trustMarks: {
    display: 'flex',
    gap: '16px',
    fontSize: '0.85rem',
    color: 'var(--text-muted)'
  },
  trustItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  heroVisualContent: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '26px',
    position: 'relative',
    padding: '12px 0'
  },
  glowingOrb: {
    position: 'absolute',
    width: '300px',
    height: '300px',
    background: 'radial-gradient(circle, rgba(147,51,234,0.3) 0%, rgba(0,0,0,0) 70%)',
    borderRadius: '50%',
    zIndex: 0
  },
  floatingCard1: {
    background: 'var(--panel-bg)',
    border: '1px solid rgba(147, 51, 234, 0.3)',
    boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
    padding: '26px 28px',
    marginBottom: '10px',
    borderRadius: '16px',
    position: 'relative',
    zIndex: 2,
    boxSizing: 'border-box'
  },
  floatingCard2: {
    background: 'var(--panel-bg)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
    padding: '26px 28px',
    marginBottom: '10px',
    borderRadius: '16px',
    position: 'relative',
    zIndex: 2,
    boxSizing: 'border-box'
  },
  floatingCard3: {
    background: 'var(--panel-bg)',
    border: '1px solid rgba(14, 165, 233, 0.4)',
    boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
    padding: '26px 28px',
    borderRadius: '16px',
    position: 'relative',
    zIndex: 2,
    boxSizing: 'border-box'
  },
  miniBadge: {
    padding: '5px 12px',
    borderRadius: '6px',
    fontSize: '0.8rem',
    background: 'rgba(14, 165, 233, 0.15)',
    color: 'var(--accent)',
    fontWeight: '600'
  },
  miniBadgeSuccess: {
    padding: '5px 12px',
    borderRadius: '6px',
    fontSize: '0.8rem',
    background: 'rgba(16, 185, 129, 0.15)',
    color: 'var(--success)',
    fontWeight: '600'
  },
  cardMiniHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    marginBottom: '16px',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    fontWeight: '600'
  },
  cardMiniTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: '700',
    fontSize: '1.2rem',
    marginBottom: '18px',
    color: 'var(--text-primary)'
  },
  cardMiniData: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 18px',
    background: 'var(--border-light)',
    borderRadius: '10px'
  },
  dataLabel: {
    fontSize: '0.85rem',
    color: 'var(--text-muted)'
  },
  dataValue: {
    fontSize: '0.9rem',
    fontWeight: '600',
    color: 'var(--text-primary)'
  },
  statsBanner: {
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
    maxWidth: '1000px',
    padding: '30px',
    marginBottom: '80px',
    flexWrap: 'wrap',
    gap: '20px'
  },
  statBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px'
  },
  statNum: {
    fontFamily: 'var(--font-display)',
    fontSize: '2.5rem',
    fontWeight: '800',
    color: 'var(--stat-text)'
  },
  statDesc: {
    color: 'var(--text-secondary)',
    fontSize: '0.9rem',
    textTransform: 'uppercase',
    letterSpacing: '1px'
  },
  statDivider: {
    width: '1px',
    height: '50px',
    background: 'var(--border-light)'
  },
  howItWorksSection: {
    width: '100%',
    maxWidth: '1200px',
    marginBottom: '100px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  sectionHeader: {
    textAlign: 'center',
    marginBottom: '50px'
  },
  sectionTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '2.2rem',
    fontWeight: '700',
    marginBottom: '12px'
  },
  sectionSubtitle: {
    color: 'var(--text-secondary)',
    fontSize: '1.1rem',
    maxWidth: '600px',
    margin: '0 auto'
  },
  stepsGridBase: {
    gap: '20px',
    alignItems: 'start',
    width: '100%'
  },
  stepItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '16px'
  },
  stepIconWrapper: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--primary) 0%, #7c3aed 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.5rem',
    fontWeight: '700',
    color: '#fff',
    boxShadow: '0 10px 20px var(--primary-glow)'
  },
  stepTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.2rem',
    fontWeight: '600'
  },
  stepDesc: {
    color: 'var(--text-secondary)',
    fontSize: '0.95rem',
    lineHeight: '1.5'
  },
  stepConnector: {
    height: '2px',
    width: '100%',
    minWidth: '50px',
    background: 'var(--border-light)',
    marginTop: '32px'
  },
  featuresGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '24px',
    width: '100%',
    maxWidth: '1200px',
    marginBottom: '80px'
  },
  featureCard: {
    padding: '40px 30px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '20px',
    transition: 'transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease'
  },
  iconWrapper: {
    width: '60px',
    height: '60px',
    borderRadius: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  featureTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.3rem',
    fontWeight: '700'
  },
  featureDesc: {
    color: 'var(--text-secondary)',
    lineHeight: '1.6',
    fontSize: '0.95rem'
  },
  ctaBanner: {
    width: '100%',
    maxWidth: '1000px',
    padding: '50px 40px',
    background: 'var(--panel-bg)',
    border: '1px solid rgba(147, 51, 234, 0.3)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '30px'
  },
  ctaContent: {
    flex: '1 1 400px'
  },
  ctaTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '2rem',
    fontWeight: '700',
    marginBottom: '10px'
  },
  ctaDesc: {
    color: 'var(--text-secondary)',
    fontSize: '1.1rem'
  },
  ctaButton: {
    padding: '16px 36px',
    fontSize: '1.1rem'
  },
  abstractBlob1: {
    position: 'absolute',
    top: '-5%',
    left: '-5%',
    width: '60vw',
    height: '60vw',
    background: 'radial-gradient(circle, rgba(147,51,234,0.1) 0%, rgba(0,0,0,0) 70%)',
    borderRadius: '50%',
    zIndex: 1,
    pointerEvents: 'none'
  },
  abstractBlob2: {
    position: 'absolute',
    bottom: '-10%',
    right: '-10%',
    width: '50vw',
    height: '50vw',
    background: 'radial-gradient(circle, rgba(14,165,233,0.08) 0%, rgba(0,0,0,0) 70%)',
    borderRadius: '50%',
    zIndex: 1,
    pointerEvents: 'none'
  },
  footer: {
    textAlign: 'center',
    padding: '40px 20px',
    color: 'var(--text-muted)',
    fontSize: '0.9rem',
    zIndex: 10,
    borderTop: '1px solid var(--border-extra-light)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px'
  }
};

export default LandingPage;
