import React, { useState } from 'react';
import { 
  Building2, Users, Coffee, ShoppingBag, Scissors, 
  ChevronRight, ChevronLeft, Check, Sparkles, Store, 
  MapPin, Phone, Mail, Globe, PartyPopper, ShoppingCart, User
} from 'lucide-react';
import './_group.css';

export function SoftFriendly() {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<'owner' | 'employee' | null>(null);
  const [businessType, setBusinessType] = useState<string | null>(null);
  const [businessSubtype, setBusinessSubtype] = useState<string | null>(null);

  const totalSteps = 6;

  const nextStep = () => setStep(s => Math.min(s + 1, totalSteps));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  const fnbSubtypes = ['Cafe / Coffee Shop', 'Restaurant', 'Food Truck', 'Bakery', 'Bar / Pub'];
  const retailSubtypes = ['Clothing Boutique', 'Grocery Store', 'Electronics', 'Gift Shop', 'Other Retail'];
  const serviceSubtypes = ['Salon / Barbershop', 'Spa / Massage', 'Repair Shop', 'Consulting', 'Other Service'];

  const getSubtypes = () => {
    if (businessType === 'fnb') return fnbSubtypes;
    if (businessType === 'retail') return retailSubtypes;
    if (businessType === 'service') return serviceSubtypes;
    return [];
  };

  return (
    <div 
      className="min-h-[100dvh] w-full flex flex-col font-sans"
      style={{ 
        backgroundColor: '#fafaf8',
        color: '#2d3748',
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
    >
      {/* Header */}
      <header className="w-full p-6 flex justify-between items-center z-10 relative">
        <div className="flex items-center gap-3 animate-fade-in">
          <div 
            className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm"
            style={{ backgroundColor: '#f59e0b', color: 'white' }}
          >
            <Sparkles size={20} strokeWidth={2.5} />
          </div>
          <span className="font-bold text-xl tracking-tight" style={{ color: '#1a202c' }}>
            ArtixPOS
          </span>
        </div>
        
        {step > 1 && step < 6 && (
          <div className="flex items-center gap-2 text-sm font-medium animate-fade-in" style={{ color: '#a0aec0' }}>
            <span>Step {step - 1} of {totalSteps - 1}</span>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 relative overflow-hidden">
        {/* Subtle background blob */}
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-20 blur-3xl pointer-events-none transition-all duration-1000"
          style={{ 
            background: 'radial-gradient(circle, #fcd34d 0%, transparent 70%)',
            transform: `translate(-50%, -50%) scale(${1 + step * 0.1})`
          }}
        />

        <div className="w-full max-w-2xl mx-auto relative z-10 flex flex-col min-h-[400px] justify-center">
          
          {/* Progress Indicator */}
          {step > 1 && step < 6 && (
            <div className="flex justify-center mb-12 animate-fade-in">
              <div className="flex gap-3">
                {Array.from({ length: totalSteps - 2 }).map((_, i) => (
                  <div 
                    key={i}
                    className="h-2 rounded-full transition-all duration-500 ease-out"
                    style={{ 
                      width: i + 2 === step ? '48px' : '16px',
                      backgroundColor: i + 2 <= step ? '#f59e0b' : '#e2e8f0',
                      opacity: i + 2 <= step ? 1 : 0.6
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Welcome */}
          {step === 1 && (
            <div className="flex flex-col items-center text-center animate-slide-in-up">
              <div className="w-24 h-24 rounded-[32px] bg-amber-100 flex items-center justify-center mb-8 shadow-sm">
                <span className="text-5xl">👋</span>
              </div>
              <h1 className="text-4xl sm:text-5xl font-extrabold mb-6 tracking-tight text-gray-900 leading-tight">
                Welcome to ArtixPOS,<br/>let's get started 🎉
              </h1>
              <p className="text-lg text-gray-500 max-w-md mx-auto leading-relaxed mb-10">
                We're excited to help you run your business. It only takes a few minutes to set up your store.
              </p>
              <button 
                onClick={nextStep}
                className="flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-white transition-all hover:scale-105 active:scale-95 shadow-lg shadow-orange-500/30 text-lg"
                style={{ backgroundColor: '#f59e0b' }}
              >
                Start Setup <ChevronRight size={20} />
              </button>
            </div>
          )}

          {/* Step 2: Role choice */}
          {step === 2 && (
            <div className="flex flex-col animate-slide-in-up">
              <div className="text-center mb-12">
                <span className="inline-block px-4 py-1.5 rounded-full text-sm font-semibold mb-4 bg-orange-100 text-orange-600">
                  Your Role
                </span>
                <h1 className="text-4xl font-extrabold mb-4 tracking-tight text-gray-900">
                  How will you use ArtixPOS?
                </h1>
                <p className="text-lg text-gray-500">
                  This helps us set up the right permissions for you.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-lg mx-auto w-full">
                {[
                  { id: 'owner', title: 'Business Owner', icon: Building2, desc: 'I own or manage the business', emoji: '🧑‍💼' },
                  { id: 'employee', title: 'Employee', icon: User, desc: 'I work at the business', emoji: '👋' }
                ].map((r) => {
                  const isSelected = role === r.id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => setRole(r.id as any)}
                      className="group relative flex flex-col items-center text-center p-8 rounded-[32px] transition-all duration-300 ease-out bg-white"
                      style={{ 
                        boxShadow: isSelected 
                          ? '0 20px 25px -5px rgba(245, 158, 11, 0.1), 0 0 0 3px #f59e0b' 
                          : '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                        transform: isSelected ? 'translateY(-4px)' : 'translateY(0)'
                      }}
                    >
                      <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-300">
                        {r.emoji}
                      </div>
                      <h3 className="text-xl font-bold mb-2 text-gray-900">{r.title}</h3>
                      <p className="text-sm text-gray-500">{r.desc}</p>
                      
                      <div 
                        className="absolute top-4 right-4 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300"
                        style={{ backgroundColor: isSelected ? '#f59e0b' : '#edf2f7', opacity: isSelected ? 1 : 0 }}
                      >
                        <Check size={14} color="white" strokeWidth={3} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Business Type */}
          {step === 3 && (
            <div className="flex flex-col animate-slide-in-up">
              <div className="text-center mb-12">
                <span className="inline-block px-4 py-1.5 rounded-full text-sm font-semibold mb-4 bg-orange-100 text-orange-600">
                  Business Profile
                </span>
                <h1 className="text-4xl font-extrabold mb-4 tracking-tight text-gray-900">
                  What's your business?
                </h1>
                <p className="text-lg text-gray-500">
                  We'll tailor ArtixPOS to your industry.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {[
                  { id: 'fnb', title: 'Food & Beverage', icon: Coffee, desc: 'Restaurants, cafes, food trucks', color: '#fef3c7', iconColor: '#d97706', emoji: '🍔' },
                  { id: 'retail', title: 'Retail', icon: ShoppingBag, desc: 'Grocery, boutiques, stores', color: '#e0e7ff', iconColor: '#4f46e5', emoji: '🛍️' },
                  { id: 'service', title: 'Services', icon: Scissors, desc: 'Salons, spas, professional', color: '#fce7f3', iconColor: '#db2777', emoji: '✂️' }
                ].map((type, i) => {
                  const isSelected = businessType === type.id;
                  return (
                    <button
                      key={type.id}
                      onClick={() => setBusinessType(type.id)}
                      className="group relative flex flex-col p-6 rounded-[32px] text-left transition-all duration-300 ease-out bg-white"
                      style={{ 
                        animationDelay: `${i * 100}ms`,
                        boxShadow: isSelected 
                          ? '0 20px 25px -5px rgba(245, 158, 11, 0.1), 0 0 0 3px #f59e0b' 
                          : '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                        transform: isSelected ? 'translateY(-4px)' : 'translateY(0)'
                      }}
                    >
                      <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-300">
                        {type.emoji}
                      </div>
                      <h3 className="text-xl font-bold mb-2 text-gray-900">{type.title}</h3>
                      <p className="text-sm text-gray-500 leading-relaxed">{type.desc}</p>

                      <div 
                        className="absolute top-6 right-6 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300"
                        style={{ backgroundColor: isSelected ? '#f59e0b' : '#edf2f7', opacity: isSelected ? 1 : 0 }}
                      >
                        <Check size={14} color="white" strokeWidth={3} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 4: Business Subtype */}
          {step === 4 && (
            <div className="flex flex-col animate-slide-in-up">
              <div className="text-center mb-10">
                <span className="inline-block px-4 py-1.5 rounded-full text-sm font-semibold mb-4 bg-orange-100 text-orange-600">
                  The Details
                </span>
                <h1 className="text-4xl font-extrabold mb-4 tracking-tight text-gray-900">
                  What kind of {businessType === 'fnb' ? 'F&B' : businessType === 'retail' ? 'retail' : 'service'}?
                </h1>
              </div>

              <div className="flex flex-wrap justify-center gap-4 max-w-xl mx-auto">
                {getSubtypes().map((subtype, i) => {
                  const isSelected = businessSubtype === subtype;
                  return (
                    <button
                      key={subtype}
                      onClick={() => setBusinessSubtype(subtype)}
                      className="px-6 py-4 rounded-2xl font-medium transition-all duration-300 text-lg"
                      style={{
                        animationDelay: `${i * 50}ms`,
                        backgroundColor: isSelected ? '#f59e0b' : 'white',
                        color: isSelected ? 'white' : '#4a5568',
                        boxShadow: isSelected ? '0 10px 15px -3px rgba(245, 158, 11, 0.2)' : '0 2px 4px rgba(0,0,0,0.05)',
                        transform: isSelected ? 'scale(1.05)' : 'scale(1)'
                      }}
                    >
                      {subtype}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 5: Store info */}
          {step === 5 && (
            <div className="flex flex-col animate-slide-in-up">
              <div className="text-center mb-10">
                <span className="inline-block px-4 py-1.5 rounded-full text-sm font-semibold mb-4 bg-orange-100 text-orange-600">
                  Almost Done
                </span>
                <h1 className="text-4xl font-extrabold mb-4 tracking-tight text-gray-900">
                  Store Details
                </h1>
                <p className="text-lg text-gray-500">Just a few more things to set up your receipts.</p>
              </div>

              <div className="bg-white p-8 rounded-[32px] shadow-sm max-w-md mx-auto w-full flex flex-col gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 ml-1">Store Name</label>
                  <div className="relative">
                    <Store className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input type="text" placeholder="My Awesome Store" className="w-full bg-gray-50 border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-amber-500 outline-none transition-all" />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 ml-1">Address</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input type="text" placeholder="123 Main St, Manila" className="w-full bg-gray-50 border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-amber-500 outline-none transition-all" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5 ml-1">Phone</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input type="tel" placeholder="+63" className="w-full bg-gray-50 border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-amber-500 outline-none transition-all" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5 ml-1">Country</label>
                    <div className="relative">
                      <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <select className="w-full bg-gray-50 border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-amber-500 outline-none transition-all appearance-none text-gray-700">
                        <option>Philippines</option>
                        <option>Singapore</option>
                        <option>Malaysia</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 6: Completion */}
          {step === 6 && (
            <div className="flex flex-col items-center text-center animate-slide-in-up">
              <div className="w-32 h-32 rounded-[40px] bg-gradient-to-tr from-amber-400 to-orange-400 flex items-center justify-center mb-10 shadow-xl shadow-orange-500/20 text-white">
                <PartyPopper size={64} strokeWidth={1.5} className="animate-bounce" />
              </div>
              <h1 className="text-4xl sm:text-5xl font-extrabold mb-4 tracking-tight text-gray-900">
                You're all set!
              </h1>
              <p className="text-lg text-gray-500 max-w-md mx-auto mb-12">
                Your store is ready. Let's start selling and growing your business with ArtixPOS.
              </p>
              
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-orange-100 flex items-center gap-4 mb-8 text-left max-w-sm w-full">
                <div className="w-12 h-12 bg-green-100 text-green-600 rounded-xl flex items-center justify-center">
                  <Check size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900">Store Created</h4>
                  <p className="text-sm text-gray-500">Dashboard unlocked</p>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* Footer Navigation */}
      {step > 1 && (
        <footer className="w-full p-6 sm:p-12 z-10 relative animate-fade-in">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <button 
              onClick={prevStep}
              className={`flex items-center gap-2 px-6 py-4 rounded-2xl font-semibold text-gray-500 hover:text-gray-900 hover:bg-white transition-all ${step === 6 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            >
              <ChevronLeft size={20} />
              Back
            </button>
            
            <button 
              onClick={step === 6 ? () => setStep(1) : nextStep}
              className="flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-white transition-all hover:scale-105 active:scale-95 shadow-lg shadow-orange-500/30"
              style={{ backgroundColor: '#f59e0b' }}
            >
              {step === 6 ? 'Go to Dashboard' : 'Continue'}
              {step !== 6 && <ChevronRight size={20} />}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
