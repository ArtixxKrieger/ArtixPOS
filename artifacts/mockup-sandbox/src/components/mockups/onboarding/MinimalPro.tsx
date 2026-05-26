import React, { useState } from 'react';
import { 
  Building2, 
  Users, 
  Coffee, 
  ShoppingBag, 
  Scissors, 
  ChevronRight, 
  ChevronLeft, 
  Check, 
  Sparkles, 
  Store, 
  MapPin, 
  Phone, 
  Mail, 
  Globe, 
  Zap, 
  Shield, 
  TrendingUp, 
  BarChart2
} from 'lucide-react';
import './_group.css';

const TOTAL_STEPS = 6;

type Role = 'owner' | 'employee' | null;
type BusinessType = 'food' | 'retail' | 'services' | null;
type BusinessSubType = string | null;

export function MinimalPro() {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<Role>(null);
  const [businessType, setBusinessType] = useState<BusinessType>(null);
  const [subType, setSubType] = useState<BusinessSubType>(null);

  const nextStep = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const prevStep = () => setStep((s) => Math.max(s - 1, 1));

  // Dynamic content for the left sidebar based on the current step
  const getSidebarContent = () => {
    switch (step) {
      case 1:
        return {
          title: "Let's build your perfect point of sale.",
          features: [
            { icon: <Zap className="w-5 h-5 text-emerald-400" />, text: "Setup takes less than 3 minutes" },
            { icon: <Shield className="w-5 h-5 text-emerald-400" />, text: "Bank-grade security built-in" },
            { icon: <TrendingUp className="w-5 h-5 text-emerald-400" />, text: "Real-time analytics & reporting" }
          ]
        };
      case 2:
        return {
          title: "Tailored to your specific role.",
          features: [
            { icon: <BarChart2 className="w-5 h-5 text-emerald-400" />, text: "Owners get full access to analytics" },
            { icon: <Users className="w-5 h-5 text-emerald-400" />, text: "Employees get streamlined POS access" },
            { icon: <Check className="w-5 h-5 text-emerald-400" />, text: "Role-based permissions" }
          ]
        };
      case 3:
      case 4:
        return {
          title: "Customized for your industry.",
          features: [
            { icon: <Store className="w-5 h-5 text-emerald-400" />, text: "Industry-specific inventory features" },
            { icon: <ShoppingBag className="w-5 h-5 text-emerald-400" />, text: "Optimized checkout flows" },
            { icon: <Sparkles className="w-5 h-5 text-emerald-400" />, text: "Smart product recommendations" }
          ]
        };
      case 5:
        return {
          title: "Almost ready for business.",
          features: [
            { icon: <Globe className="w-5 h-5 text-emerald-400" />, text: "Localized for the Philippines" },
            { icon: <Check className="w-5 h-5 text-emerald-400" />, text: "BIR compliance ready" },
            { icon: <Zap className="w-5 h-5 text-emerald-400" />, text: "Offline mode capability" }
          ]
        };
      case 6:
        return {
          title: "You're all set.",
          features: [
            { icon: <Sparkles className="w-5 h-5 text-emerald-400" />, text: "Your dashboard is ready" },
            { icon: <Check className="w-5 h-5 text-emerald-400" />, text: "System configured to your needs" },
            { icon: <Zap className="w-5 h-5 text-emerald-400" />, text: "Start ringing up sales instantly" }
          ]
        };
      default:
        return { title: "", features: [] };
    }
  };

  const sidebarContent = getSidebarContent();

  return (
    <div className="flex h-screen w-full bg-white font-sans text-slate-900 overflow-hidden">
      {/* LEFT SIDEBAR - Dark, Rich, Branding */}
      <div className="hidden lg:flex lg:w-[480px] bg-slate-900 flex-col justify-between p-12 text-white relative overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-[20%] -left-[20%] w-[140%] h-[140%] bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.15),transparent_50%)]" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-24">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <div className="w-4 h-4 bg-white rounded-sm" />
            </div>
            <span className="text-xl font-bold tracking-tight">ArtixPOS</span>
          </div>

          <div className="animate-fade-in" key={step}>
            <h2 className="text-4xl font-semibold leading-tight tracking-tight mb-8 text-slate-50">
              {sidebarContent.title}
            </h2>
            
            <div className="space-y-6">
              {sidebarContent.features.map((feature, idx) => (
                <div key={idx} className="flex items-center gap-4 animate-slide-in-up" style={{ animationDelay: `${idx * 100}ms` }}>
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                    {feature.icon}
                  </div>
                  <p className="text-slate-300 font-medium">{feature.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative z-10 text-sm text-slate-500">
          © {new Date().getFullYear()} ArtixPOS. Crafted for Philippine businesses.
        </div>
      </div>

      {/* RIGHT PANEL - Content, Forms */}
      <div className="flex-1 flex flex-col relative">
        {/* Progress Bar */}
        <div className="absolute top-0 left-0 w-full h-1 bg-slate-100">
          <div 
            className="h-full bg-emerald-500 transition-all duration-500 ease-in-out" 
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        {/* Mobile Header */}
        <div className="lg:hidden p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-emerald-500 flex items-center justify-center">
              <div className="w-3 h-3 bg-white rounded-sm" />
            </div>
            <span className="font-bold tracking-tight">ArtixPOS</span>
          </div>
          <span className="text-sm font-medium text-slate-400">Step {step} of {TOTAL_STEPS}</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-12 md:py-24 h-full flex flex-col justify-center">
            
            <div className="animate-fade-in" key={step}>
              {/* STEP 1: WELCOME */}
              {step === 1 && (
                <div className="space-y-8 animate-slide-in-up">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-sm font-medium mb-4">
                    <Sparkles className="w-4 h-4" />
                    <span>Next-generation POS</span>
                  </div>
                  <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900">
                    Welcome to ArtixPOS
                  </h1>
                  <p className="text-lg text-slate-500 max-w-lg leading-relaxed">
                    Set up your business in minutes and get back to what matters most — serving your customers.
                  </p>
                </div>
              )}

              {/* STEP 2: ROLE */}
              {step === 2 && (
                <div className="space-y-8 animate-slide-in-up">
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">How will you use ArtixPOS?</h1>
                    <p className="text-slate-500">Select your role to personalize your dashboard experience.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      onClick={() => setRole('owner')}
                      className={`text-left p-6 rounded-2xl border-2 transition-all duration-200 ${
                        role === 'owner' 
                          ? 'border-emerald-500 bg-emerald-50/50 shadow-sm' 
                          : 'border-slate-200 hover:border-emerald-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-full bg-white border border-slate-100 shadow-sm flex items-center justify-center mb-4">
                        <Building2 className={`w-6 h-6 ${role === 'owner' ? 'text-emerald-500' : 'text-slate-400'}`} />
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900 mb-1">Business Owner</h3>
                      <p className="text-sm text-slate-500">I want to set up my store, manage inventory, and view reports.</p>
                    </button>

                    <button
                      onClick={() => setRole('employee')}
                      className={`text-left p-6 rounded-2xl border-2 transition-all duration-200 ${
                        role === 'employee' 
                          ? 'border-emerald-500 bg-emerald-50/50 shadow-sm' 
                          : 'border-slate-200 hover:border-emerald-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-full bg-white border border-slate-100 shadow-sm flex items-center justify-center mb-4">
                        <Users className={`w-6 h-6 ${role === 'employee' ? 'text-emerald-500' : 'text-slate-400'}`} />
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900 mb-1">Staff / Employee</h3>
                      <p className="text-sm text-slate-500">I need to ring up sales, manage orders, and check out customers.</p>
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: BUSINESS TYPE */}
              {step === 3 && (
                <div className="space-y-8 animate-slide-in-up">
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">What kind of business?</h1>
                    <p className="text-slate-500">We'll pre-configure your settings based on your industry.</p>
                  </div>

                  <div className="space-y-3">
                    {[
                      { id: 'food', title: 'Food & Beverage', desc: 'Restaurants, Cafes, Bars, Food Trucks', icon: Coffee },
                      { id: 'retail', title: 'Retail Store', desc: 'Clothing, Electronics, Groceries, Boutiques', icon: ShoppingBag },
                      { id: 'services', title: 'Services', desc: 'Salons, Spas, Repair Shops, Clinics', icon: Scissors },
                    ].map((type) => (
                      <button
                        key={type.id}
                        onClick={() => setBusinessType(type.id as BusinessType)}
                        className={`w-full text-left p-4 rounded-xl border-2 flex items-center gap-4 transition-all duration-200 ${
                          businessType === type.id 
                            ? 'border-emerald-500 bg-emerald-50/50 shadow-sm' 
                            : 'border-slate-200 hover:border-emerald-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${businessType === type.id ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                          <type.icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base font-semibold text-slate-900">{type.title}</h3>
                          <p className="text-sm text-slate-500">{type.desc}</p>
                        </div>
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${businessType === type.id ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'}`}>
                          {businessType === type.id && <Check className="w-3.5 h-3.5 text-white" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 4: BUSINESS SUBTYPE */}
              {step === 4 && (
                <div className="space-y-8 animate-slide-in-up">
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Let's get specific.</h1>
                    <p className="text-slate-500">Choose the best fit for your {businessType === 'food' ? 'Food & Beverage' : businessType === 'retail' ? 'Retail' : 'Service'} business.</p>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {(businessType === 'food' 
                      ? ['Coffee Shop', 'Restaurant', 'Fast Food', 'Food Kiosk', 'Bakery', 'Bar']
                      : businessType === 'retail'
                      ? ['Clothing', 'Grocery', 'Electronics', 'Hardware', 'Convenience', 'Books']
                      : ['Salon', 'Spa', 'Barbershop', 'Repair', 'Clinic', 'Consulting']
                    ).map((item) => (
                      <button
                        key={item}
                        onClick={() => setSubType(item)}
                        className={`p-4 rounded-xl border-2 text-center transition-all duration-200 ${
                          subType === item 
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold shadow-sm' 
                            : 'border-slate-200 hover:border-emerald-200 text-slate-600 font-medium hover:bg-slate-50'
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 5: STORE INFO */}
              {step === 5 && (
                <div className="space-y-8 animate-slide-in-up">
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Store Details</h1>
                    <p className="text-slate-500">Basic information to appear on your receipts and reports.</p>
                  </div>

                  <div className="space-y-5">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-900">Store Name</label>
                      <div className="relative">
                        <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input type="text" placeholder="e.g. Artix Cafe" className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-shadow" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-900">Email Address</label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                          <input type="email" placeholder="hello@store.com" className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-shadow" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-900">Phone Number</label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                          <input type="tel" placeholder="+63 900 000 0000" className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-shadow" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-900">Store Address</label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                        <textarea placeholder="Building, Street, City, Province" rows={3} className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-shadow resize-none"></textarea>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 6: DONE */}
              {step === 6 && (
                <div className="space-y-8 animate-slide-in-up text-center flex flex-col items-center py-12">
                  <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                    <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30">
                      <Check className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  
                  <h1 className="text-4xl font-bold tracking-tight text-slate-900">You're all set!</h1>
                  <p className="text-lg text-slate-500 max-w-md">
                    Your workspace has been successfully created and tailored for your {subType || businessType || 'business'}.
                  </p>

                  <div className="w-full max-w-sm mt-8 p-6 bg-slate-50 border border-slate-100 rounded-2xl">
                    <h4 className="font-semibold text-slate-900 mb-4">What's unlocked:</h4>
                    <ul className="space-y-3 text-left">
                      <li className="flex items-center gap-3 text-slate-600">
                        <Check className="w-5 h-5 text-emerald-500" /> POS Interface Access
                      </li>
                      <li className="flex items-center gap-3 text-slate-600">
                        <Check className="w-5 h-5 text-emerald-500" /> Initial Inventory Setup
                      </li>
                      <li className="flex items-center gap-3 text-slate-600">
                        <Check className="w-5 h-5 text-emerald-500" /> Dashboard Analytics
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Footer Navigation */}
        <div className="p-6 md:px-12 md:py-8 border-t border-slate-100 bg-white z-10">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            {step > 1 && step < TOTAL_STEPS ? (
              <button 
                onClick={prevStep}
                className="px-6 py-3 rounded-xl font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors flex items-center gap-2"
              >
                <ChevronLeft className="w-5 h-5" /> Back
              </button>
            ) : (
              <div></div> // Spacer
            )}

            {step < TOTAL_STEPS ? (
              <button 
                onClick={nextStep}
                disabled={
                  (step === 2 && !role) || 
                  (step === 3 && !businessType) || 
                  (step === 4 && !subType)
                }
                className={`px-8 py-3 rounded-xl font-semibold text-white transition-all flex items-center gap-2 shadow-sm ${
                  ((step === 2 && !role) || (step === 3 && !businessType) || (step === 4 && !subType))
                    ? 'bg-slate-300 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 hover:shadow hover:-translate-y-0.5'
                }`}
              >
                {step === 1 ? 'Get Started' : 'Continue'} <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <button 
                className="px-8 py-3 rounded-xl font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-slate-900/20 hover:-translate-y-0.5 w-full md:w-auto justify-center"
              >
                Go to Dashboard <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}