import { useState, useEffect } from 'react';

export function useInstallPWA() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
      setIsInstallable(true);
      setShowFallback(false);
    };

    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      setIsInstallable(false);
    }

    // Listen for app install
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setInstallPrompt(null);
    });

    // Add beforeinstallprompt listener
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // If no beforeinstallprompt fires after 2 seconds, show fallback
    const timeout = setTimeout(() => {
      if (!installPrompt) {
        setShowFallback(true);
      }
    }, 2000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      clearTimeout(timeout);
    };
  }, [installPrompt]);

  const install = async () => {
    if (!installPrompt) return;

    try {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstallable(false);
      }
    } catch (error) {
      console.error('Installation failed:', error);
    }
  };

  return { 
    installPrompt, 
    isInstallable: isInstallable || showFallback, 
    isInstalled, 
    install,
    isFallback: showFallback
  };
}
