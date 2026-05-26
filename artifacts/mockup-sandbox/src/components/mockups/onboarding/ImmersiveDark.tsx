import './_dark.css';
import { useState } from 'react';
import {
  ShoppingCart, Building2, Users, Coffee, ShoppingBag, Scissors,
  ChevronRight, ChevronLeft, Check, Sparkles, Store, MapPin, Phone,
  Mail, Globe, UtensilsCrossed, Dumbbell, Zap, Shield, BarChart2,
} from 'lucide-react';

type Step = 'welcome' | 'role' | 'business_type' | 'business_subtype' | 'store_info' | 'done';

const BUSINESS_TYPES = [
  { id: 'food_beverage', label: 'Food & Beverage', desc: 'Cafes, restaurants, bakeries', icon: Coffee, color: '#f59e0b' },
  { id: 'retail', label: 'Retail', desc: 'Clothing, electronics, grocery', icon: ShoppingBag, color: '#3b82f6' },
  { id: 'services', label: 'Services', desc: 'Salon, gym, spa, laundry', icon: Scissors, color: '#ec4899' },
];

const SUBTYPES: Record<string, { id: string; label: string; icon: React.ElementType }[]> = {
  food_beverage: [
    { id: 'cafe', label: 'Cafe / Coffee Shop', icon: Coffee },
    { id: 'restaurant', label: 'Restaurant', icon: UtensilsCrossed },
    { id: 'bakery', label: 'Bakery', icon: Store },
    { id: 'food_truck', label: 'Food Truck', icon: ShoppingCart },
  ],
  retail: [
    { id: 'clothing', label: 'Clothing / Fashion', icon: ShoppingBag },
    { id: 'electronics', label: 'Electronics', icon: Zap },
    { id: 'grocery', label: 'Grocery / Supermarket', icon: ShoppingCart },
    { id: 'pharmacy', label: 'Pharmacy', icon: Shield },
  ],
  services: [
    { id: 'salon', label: 'Salon / Barbershop', icon: Scissors },
    { id: 'gym', label: 'Gym / Fitness', icon: Dumbbell },
    { id: 'spa', label: 'Spa & Wellness', icon: Sparkles },
    { id: 'clinic', label: 'Clinic / Healthcare', icon: Shield },
  ],
};

const STEPS: Step[] = ['welcome', 'role', 'business_type', 'business_subtype', 'store_info', 'done'];
const STEP_LABELS = ['Start', 'Role', 'Business', 'Type', 'Info', 'Done'];

function StepProgress({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            style={{
              width: i === current ? 28 : 20,
              height: 8,
              borderRadius: 4,
              background: i < current
                ? 'linear-gradient(90deg, #7c3aed, #a78bfa)'
                : i === current
                  ? 'linear-gradient(90deg, #7c3aed, #a78bfa)'
                  : 'rgba(255,255,255,0.12)',
              transition: 'all 0.3s ease',
              boxShadow: i <= current ? '0 0 8px rgba(139,92,246,0.6)' : 'none',
            }}
          />
        </div>
      ))}
    </div>
  );
}

export function ImmersiveDark() {
  const [step, setStep] = useState<Step>('welcome');
  const [role, setRole] = useState<string | null>(null);
  const [bizType, setBizType] = useState<string | null>(null);
  const [bizSubtype, setBizSubtype] = useState<string | null>(null);
  const [storeName, setStoreName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('+63 ');
  const [email, setEmail] = useState('');

  const stepIndex = STEPS.indexOf(step);

  function goNext(next: Step) {
    setStep(next);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(139,92,246,0.3)',
    borderRadius: 12,
    padding: '12px 16px',
    color: '#f0f0ff',
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #04040f 0%, #0a0618 40%, #0c0420 70%, #06040f 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: '24px',
      }}
    >
      {/* Atmospheric orbs */}
      <div className="dark-orb1" style={{
        position: 'absolute', top: '10%', left: '15%',
        width: 400, height: 400,
        background: 'radial-gradient(circle, rgba(109,40,217,0.25) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none',
      }} />
      <div className="dark-orb2" style={{
        position: 'absolute', bottom: '15%', right: '10%',
        width: 500, height: 500,
        background: 'radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none',
      }} />
      <div className="dark-orb3" style={{
        position: 'absolute', top: '50%', left: '60%',
        width: 300, height: 300,
        background: 'radial-gradient(circle, rgba(79,70,229,0.2) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none',
      }} />

      {/* Subtle grid overlay */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.03, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      {/* Card */}
      <div className="dark-card anim-fade-up" style={{
        position: 'relative', zIndex: 10,
        width: '100%', maxWidth: 460,
        background: 'rgba(12,8,28,0.85)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(139,92,246,0.25)',
        borderRadius: 28,
        padding: '40px 40px 36px',
        boxShadow: '0 0 0 1px rgba(139,92,246,0.1), 0 24px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Logo */}
        <div className="anim-fade-up" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(124,58,237,0.5)',
          }}>
            <ShoppingCart size={18} color="#fff" />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(196,181,253,0.9)', textTransform: 'uppercase' }}>
            ArtixPOS
          </span>
        </div>

        <StepProgress current={stepIndex} />

        {/* ── WELCOME ── */}
        {step === 'welcome' && (
          <div className="anim-step-in">
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 13, color: 'rgba(139,92,246,0.9)', fontWeight: 600, marginBottom: 12, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                ✦ Your business OS awaits
              </div>
              <h1 style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.15, color: '#f0ecff', marginBottom: 14 }}>
                Welcome to{' '}
                <span className="shimmer-text">ArtixPOS</span>
              </h1>
              <p style={{ fontSize: 15, color: 'rgba(196,181,253,0.7)', lineHeight: 1.6 }}>
                Let's get your business set up in under 2 minutes. Point of sale, inventory, analytics — all in one place.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
              {[
                { icon: Zap, text: 'Works offline — even without internet' },
                { icon: BarChart2, text: 'Real-time analytics & reports' },
                { icon: Shield, text: 'Secure, BIR-ready & compliant' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={13} color="#a78bfa" />
                  </div>
                  <span style={{ fontSize: 13, color: 'rgba(220,215,255,0.75)' }}>{text}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => goNext('role')}
              style={{
                width: '100%', padding: '14px 24px',
                background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                border: 'none', borderRadius: 14, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                color: '#fff', fontSize: 15, fontWeight: 700,
                boxShadow: '0 0 24px rgba(124,58,237,0.5), 0 4px 16px rgba(0,0,0,0.3)',
                transition: 'transform 0.15s',
              }}
              onMouseOver={e => (e.currentTarget.style.transform = 'translateY(-1px)')}
              onMouseOut={e => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              Let's get started <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* ── ROLE ── */}
        {step === 'role' && (
          <div className="anim-step-in">
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f0ecff', marginBottom: 8 }}>Who are you?</h2>
            <p style={{ fontSize: 14, color: 'rgba(196,181,253,0.6)', marginBottom: 28 }}>This helps us tailor your experience.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
              {[
                { id: 'owner', icon: Building2, title: 'Business Owner', desc: 'Set up a new business or branch' },
                { id: 'employee', icon: Users, title: 'Employee', desc: 'Join an existing team with an invite' },
              ].map(({ id, icon: Icon, title, desc }) => (
                <button
                  key={id}
                  onClick={() => { setRole(id); goNext(id === 'owner' ? 'business_type' : 'store_info'); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px',
                    background: role === id ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.04)',
                    border: role === id ? '1.5px solid rgba(124,58,237,0.6)' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 16, cursor: 'pointer', textAlign: 'left', width: '100%',
                    transition: 'all 0.2s',
                  }}
                  onMouseOver={e => { if (role !== id) e.currentTarget.style.borderColor = 'rgba(124,58,237,0.35)'; }}
                  onMouseOut={e => { if (role !== id) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(109,40,217,0.2))',
                    border: '1px solid rgba(124,58,237,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Icon size={20} color="#a78bfa" />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#e8e0ff', marginBottom: 2 }}>{title}</div>
                    <div style={{ fontSize: 12, color: 'rgba(196,181,253,0.55)' }}>{desc}</div>
                  </div>
                  <ChevronRight size={16} color="rgba(139,92,246,0.5)" style={{ marginLeft: 'auto' }} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── BUSINESS TYPE ── */}
        {step === 'business_type' && (
          <div className="anim-step-in">
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f0ecff', marginBottom: 8 }}>What's your business?</h2>
            <p style={{ fontSize: 14, color: 'rgba(196,181,253,0.6)', marginBottom: 28 }}>We'll tailor features to your industry.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
              {BUSINESS_TYPES.map(({ id, label, desc, icon: Icon, color }) => (
                <button
                  key={id}
                  onClick={() => { setBizType(id); goNext('business_subtype'); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px',
                    background: bizType === id ? 'rgba(124,58,237,0.18)' : 'rgba(255,255,255,0.04)',
                    border: bizType === id ? '1.5px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 14, cursor: 'pointer', textAlign: 'left', width: '100%',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                    background: `${color}22`, border: `1px solid ${color}44`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={18} color={color} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#e8e0ff', marginBottom: 1 }}>{label}</div>
                    <div style={{ fontSize: 12, color: 'rgba(196,181,253,0.5)' }}>{desc}</div>
                  </div>
                  <ChevronRight size={16} color="rgba(139,92,246,0.4)" style={{ marginLeft: 'auto' }} />
                </button>
              ))}
            </div>

            <button onClick={() => setStep('role')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(139,92,246,0.7)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
              <ChevronLeft size={14} /> Back
            </button>
          </div>
        )}

        {/* ── BUSINESS SUBTYPE ── */}
        {step === 'business_subtype' && bizType && (
          <div className="anim-step-in">
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f0ecff', marginBottom: 8 }}>More specifically...</h2>
            <p style={{ fontSize: 14, color: 'rgba(196,181,253,0.6)', marginBottom: 24 }}>Pick the closest match.</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 28 }}>
              {(SUBTYPES[bizType] || []).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => { setBizSubtype(id); goNext('store_info'); }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    padding: '16px 12px',
                    background: bizSubtype === id ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.04)',
                    border: bizSubtype === id ? '1.5px solid rgba(124,58,237,0.6)' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 14, cursor: 'pointer', transition: 'all 0.2s',
                  }}
                >
                  <Icon size={22} color="#a78bfa" />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#d4c8ff', textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
                </button>
              ))}
            </div>

            <button onClick={() => setStep('business_type')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(139,92,246,0.7)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
              <ChevronLeft size={14} /> Back
            </button>
          </div>
        )}

        {/* ── STORE INFO ── */}
        {step === 'store_info' && (
          <div className="anim-step-in">
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f0ecff', marginBottom: 8 }}>Your store details</h2>
            <p style={{ fontSize: 14, color: 'rgba(196,181,253,0.6)', marginBottom: 24 }}>Almost there — just a few more details.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
              {[
                { icon: Store, placeholder: 'Store name', value: storeName, onChange: setStoreName },
                { icon: MapPin, placeholder: 'Address', value: address, onChange: setAddress },
                { icon: Phone, placeholder: 'Phone number', value: phone, onChange: setPhone },
                { icon: Mail, placeholder: 'Email address', value: email, onChange: setEmail },
              ].map(({ icon: Icon, placeholder, value, onChange }) => (
                <div key={placeholder} style={{ position: 'relative' }}>
                  <Icon size={15} color="rgba(139,92,246,0.6)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  <input
                    type={placeholder.includes('Email') ? 'email' : 'text'}
                    placeholder={placeholder}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    style={{ ...inputStyle, paddingLeft: 40 }}
                    onFocus={e => (e.target.style.borderColor = 'rgba(139,92,246,0.6)')}
                    onBlur={e => (e.target.style.borderColor = 'rgba(139,92,246,0.3)')}
                  />
                </div>
              ))}

              <div style={{ position: 'relative' }}>
                <Globe size={15} color="rgba(139,92,246,0.6)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 1 }} />
                <select
                  style={{ ...inputStyle, paddingLeft: 40, appearance: 'none', cursor: 'pointer' }}
                  defaultValue="PH"
                >
                  <option value="PH">🇵🇭 Philippines (PHP)</option>
                  <option value="US">🇺🇸 United States (USD)</option>
                  <option value="SG">🇸🇬 Singapore (SGD)</option>
                </select>
              </div>
            </div>

            <button
              onClick={() => goNext('done')}
              style={{
                width: '100%', padding: '14px 24px',
                background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                border: 'none', borderRadius: 14, cursor: 'pointer',
                color: '#fff', fontSize: 15, fontWeight: 700,
                boxShadow: '0 0 24px rgba(124,58,237,0.4)',
                marginBottom: 12,
              }}
            >
              Complete Setup
            </button>

            <button onClick={() => setStep(bizType ? 'business_subtype' : 'role')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(139,92,246,0.7)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
              <ChevronLeft size={14} /> Back
            </button>
          </div>
        )}

        {/* ── DONE ── */}
        {step === 'done' && (
          <div className="anim-step-in" style={{ textAlign: 'center' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(109,40,217,0.2))',
              border: '2px solid rgba(124,58,237,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px',
              boxShadow: '0 0 32px rgba(124,58,237,0.4)',
            }}>
              <Check size={32} color="#a78bfa" />
            </div>

            <h2 style={{ fontSize: 26, fontWeight: 800, color: '#f0ecff', marginBottom: 8 }}>
              You're all set! 🎉
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(196,181,253,0.65)', marginBottom: 28, lineHeight: 1.6 }}>
              Welcome aboard. Your business OS is ready — start selling, tracking, and growing today.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32, textAlign: 'left' }}>
              {['POS ready to take your first sale', 'Inventory tracking enabled', 'AI assistant activated', 'Analytics dashboard unlocked'].map(text => (
                <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, background: 'rgba(124,58,237,0.25)', border: '1px solid rgba(124,58,237,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Check size={11} color="#a78bfa" />
                  </div>
                  <span style={{ fontSize: 13, color: 'rgba(220,215,255,0.75)' }}>{text}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setStep('welcome')}
              style={{
                width: '100%', padding: '14px 24px',
                background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                border: 'none', borderRadius: 14, cursor: 'pointer',
                color: '#fff', fontSize: 15, fontWeight: 700,
                boxShadow: '0 0 24px rgba(124,58,237,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <Sparkles size={16} /> Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
