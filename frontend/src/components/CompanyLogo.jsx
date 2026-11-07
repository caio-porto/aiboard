import React, { useState, useEffect } from 'react';
import { getOfficialLogoUrl, getOfficialBrandName } from '../utils/reportFormatters';

/**
 * Componente unificado que garante exibição consistente do logotipo oficial configurado
 * em todos os módulos, modais, cabeçalhos e telas de carregamento do sistema.
 */
export function CompanyLogo({ className = "h-8 object-contain", alt, style = {} }) {
  const [logoSrc, setLogoSrc] = useState(() => getOfficialLogoUrl());
  const [brandName, setBrandName] = useState(() => getOfficialBrandName());
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const syncBranding = (e) => {
      if (e?.detail) {
        if (e.detail.company_logo_url) setLogoSrc(e.detail.company_logo_url);
        if (e.detail.company_name) setBrandName(e.detail.company_name);
      } else {
        setLogoSrc(getOfficialLogoUrl());
        setBrandName(getOfficialBrandName());
      }
      setHasError(false);
    };

    window.addEventListener('company_settings_updated', syncBranding);
    return () => window.removeEventListener('company_settings_updated', syncBranding);
  }, []);

  if (hasError) {
    return (
      <span className="font-black text-[#16422B] text-base tracking-tight select-none">
        {brandName}
      </span>
    );
  }

  return (
    <img
      src={logoSrc}
      alt={alt || brandName}
      onError={() => {
        if (logoSrc !== '/logo.svg') {
          setLogoSrc('/logo.svg');
        } else {
          setHasError(true);
        }
      }}
      className={className}
      style={style}
    />
  );
}
