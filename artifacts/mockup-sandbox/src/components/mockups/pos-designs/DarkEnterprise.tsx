import React, { useState } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  BarChart2,
  Settings,
  Search,
  Plus,
  Minus,
  Banknote,
  CreditCard,
  QrCode,
  Terminal,
  Clock,
  Wifi
} from 'lucide-react';

const PRODUCTS = [
  { id: 1, name: 'Espresso', price: 95 },
  { id: 2, name: 'Flat White', price: 130 },
  { id: 3, name: 'Pour Over', price: 160 },
  { id: 4, name: 'Croissant', price: 80 },
  { id: 5, name: 'Bagel', price: 95 },
  { id: 6, name: 'Matcha Latte', price: 150 },
  { id: 7, name: 'Avocado Toast', price: 220 },
  { id: 8, name: 'Cold Brew', price: 140 },
];

const CATEGORIES = ['All', 'Beverages', 'Food', 'Electronics', 'Accessories'];

export function DarkEnterprise() {
  const [activeTab, setActiveTab] = useState('All');
  const [cart, setCart] = useState<{ id: number; name: string; price: number; qty: number }[]>([
    { id: 1, name: 'Espresso', price: 95, qty: 2 },
    { id: 4, name: 'Croissant', price: 80, qty: 1 }
  ]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const tax = subtotal * 0.12;
  const total = subtotal + tax;

  const updateQty = (id: number, delta: number) => {
    setCart(prev => 
      prev.map(item => item.id === id ? { ...item, qty: Math.max(0, item.qty + delta) } : item)
      .filter(item => item.qty > 0)
    );
  };

  const addToCart = (product: typeof PRODUCTS[0]) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { ...product, qty: 1 }];
    });
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#09090b] text-[#fafafa] font-sans antialiased text-[13px]" style={{ fontFamily: 'Inter, Geist, sans-serif' }}>
      
      {/* Top Bar */}
      <header className="h-14 border-b border-[#27272a] bg-[#09090b] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-sm tracking-tight">ArtixPOS</span>
          <div className="h-4 w-px bg-[#27272a]" />
          <span className="text-[#a1a1aa] text-xs font-medium">Main Branch</span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a1a1aa]" />
            <input 
              type="text" 
              placeholder="Search products..." 
              className="bg-[#18181b] border border-[#27272a] rounded-md h-8 pl-9 pr-3 text-xs w-64 focus:outline-none focus:border-[#3b82f6] text-[#fafafa] placeholder:text-[#52525b] transition-colors"
            />
          </div>
          <div className="flex items-center gap-2 bg-[#111111] border border-[#27272a] rounded-md h-8 px-3">
            <span className="w-2 h-2 rounded-full bg-[#22c55e]" />
            <span className="text-xs font-medium">₱24,850 today</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-[#27272a] flex items-center justify-center text-xs font-semibold cursor-pointer hover:bg-[#3f3f46] transition-colors">
            K
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        
        {/* Sidebar */}
        <aside className="w-[56px] bg-[#111111] border-r border-[#27272a] flex flex-col items-center py-4 gap-6 shrink-0 z-10">
          <SidebarIcon icon={LayoutDashboard} />
          <SidebarIcon icon={ShoppingCart} active />
          <SidebarIcon icon={Package} />
          <SidebarIcon icon={Users} />
          <SidebarIcon icon={BarChart2} />
          <div className="mt-auto">
            <SidebarIcon icon={Settings} />
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0">
          
          {/* Categories */}
          <div className="px-4 pt-4 pb-2 border-b border-[#27272a]">
            <div className="flex gap-6">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveTab(cat)}
                  className={`pb-3 text-xs font-medium transition-colors relative ${
                    activeTab === cat ? 'text-[#fafafa]' : 'text-[#a1a1aa] hover:text-[#e4e4e7]'
                  }`}
                >
                  {cat}
                  {activeTab === cat && (
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#fafafa]" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-auto p-4">
            <div className="grid grid-cols-4 gap-3 auto-rows-max">
              {PRODUCTS.map(product => (
                <div 
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="bg-[#18181b] border border-[#27272a] rounded-[6px] p-2 hover:border-[#3f3f46] cursor-pointer transition-colors group flex flex-col"
                >
                  <div className="w-full aspect-square bg-[#111111] rounded-[4px] mb-3 flex items-center justify-center border border-[#27272a]/50">
                    <Package className="w-8 h-8 text-[#27272a]" />
                  </div>
                  <div className="flex items-start justify-between mt-auto">
                    <div className="flex flex-col">
                      <span className="font-medium text-[#fafafa] text-xs leading-tight mb-1">{product.name}</span>
                      <span className="text-[#a1a1aa] text-xs font-mono">₱{product.price}</span>
                    </div>
                    <button className="w-6 h-6 rounded bg-[#27272a] flex items-center justify-center text-[#fafafa] opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#3f3f46]">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>

        {/* Cart Panel */}
        <aside className="w-[340px] bg-[#111111] border-l border-[#27272a] flex flex-col shrink-0">
          <div className="h-14 border-b border-[#27272a] flex items-center px-4 shrink-0">
            <h2 className="font-semibold text-sm">Order #0847</h2>
          </div>
          
          <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
            {cart.map(item => (
              <div key={item.id} className="flex flex-col gap-2 p-3 bg-[#18181b] border border-[#27272a] rounded-[6px]">
                <div className="flex justify-between items-start">
                  <span className="font-medium text-xs">{item.name}</span>
                  <span className="text-xs font-mono">₱{(item.price * item.qty).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#a1a1aa] text-[11px] font-mono">₱{item.price} / ea</span>
                  <div className="flex items-center gap-3 bg-[#09090b] rounded p-1 border border-[#27272a]">
                    <button onClick={() => updateQty(item.id, -1)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] transition-colors">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-xs w-4 text-center font-mono">{item.qty}</span>
                    <button onClick={() => updateQty(item.id, 1)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#27272a] text-[#a1a1aa] hover:text-[#fafafa] transition-colors">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 bg-[#09090b] border-t border-[#27272a] flex flex-col gap-4 shrink-0">
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs text-[#a1a1aa]">
                <span>Subtotal</span>
                <span className="font-mono">₱{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-[#a1a1aa]">
                <span>Tax (12%)</span>
                <span className="font-mono">₱{tax.toFixed(2)}</span>
              </div>
              <div className="h-px bg-[#27272a] my-1" />
              <div className="flex justify-between text-sm font-semibold text-[#fafafa]">
                <span>Total</span>
                <span className="font-mono text-[#22c55e]">₱{total.toFixed(2)}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <PaymentButton icon={Banknote} label="CASH" />
              <PaymentButton icon={CreditCard} label="CARD" />
              <PaymentButton icon={QrCode} label="QR" />
            </div>

            <button className="w-full h-[44px] bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-[6px] font-medium text-sm transition-colors flex items-center justify-center gap-2 mt-1">
              Complete Sale
              <span className="font-mono font-semibold">₱{total.toFixed(2)}</span>
            </button>
          </div>
        </aside>

      </div>

      {/* Status Bar */}
      <footer className="h-8 border-t border-[#27272a] bg-[#09090b] flex items-center px-4 justify-between shrink-0 text-[11px] text-[#a1a1aa] uppercase tracking-[0.1em] font-medium">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Terminal className="w-3 h-3" />
            <span>Term-01</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            <span>Shift: 08:00 - 16:00</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-[#22c55e]">
            <Wifi className="w-3 h-3" />
            <span>Online</span>
          </div>
          <span>v1.2.4</span>
        </div>
      </footer>
    </div>
  );
}

function SidebarIcon({ icon: Icon, active = false }: { icon: any, active?: boolean }) {
  return (
    <div className="relative group flex justify-center w-full">
      <button className={`p-2 rounded-md transition-colors flex items-center justify-center ${
        active 
          ? 'bg-[#27272a] text-[#fafafa]' 
          : 'text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#18181b]'
      }`}>
        <Icon className="w-5 h-5" strokeWidth={1.5} />
      </button>
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#fafafa] rounded-r-full" />
      )}
    </div>
  );
}

function PaymentButton({ icon: Icon, label }: { icon: any, label: string }) {
  return (
    <button className="h-[44px] bg-[#18181b] border border-[#27272a] hover:bg-[#27272a] hover:border-[#3f3f46] rounded-[6px] flex flex-col items-center justify-center gap-1 transition-colors group">
      <Icon className="w-4 h-4 text-[#a1a1aa] group-hover:text-[#fafafa] transition-colors" strokeWidth={1.5} />
      <span className="text-[10px] uppercase tracking-wider text-[#a1a1aa] group-hover:text-[#fafafa] transition-colors font-semibold">
        {label}
      </span>
    </button>
  );
}
