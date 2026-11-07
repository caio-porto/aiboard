import React, { useState } from 'react';
import {
  Globe,
  Database,
  Mail,
  FileSpreadsheet,
  Headphones,
  MessageSquare,
  CircleDollarSign,
  Landmark,
  Megaphone,
  Target,
  Clock,
  ShoppingBag,
  UtensilsCrossed,
  Send,
  Zap,
  Bot,
  Building2,
  TrendingUp,
  Cpu
} from 'lucide-react';

// Mapeamento de domínios e marcas oficiais para logos reais de alta resolução
const LOGO_MAP = {
  // Google Workspace
  gmail: {
    domain: 'mail.google.com',
    fallbackIcon: Mail,
    bgColor: 'bg-red-50',
    color: '#EA4335',
    logoUrl: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico'
  },
  drive: {
    domain: 'drive.google.com',
    fallbackIcon: FileSpreadsheet,
    bgColor: 'bg-blue-50',
    color: '#1A73E8',
    logoUrl: 'https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png'
  },
  google_ads: {
    domain: 'ads.google.com',
    fallbackIcon: Target,
    bgColor: 'bg-amber-50',
    color: '#FBBC04',
    logoUrl: 'https://www.gstatic.com/analytics-fe/growth-shared-components/v1/favicons/google-ads.png'
  },

  // Delivery & Vendas
  ifood: {
    domain: 'ifood.com.br',
    fallbackIcon: ShoppingBag,
    bgColor: 'bg-red-50',
    color: '#EA1D2C',
    logoUrl: 'https://static.ifood-static.com.br/static/icons/favicon-32x32.png'
  },
  '99food': {
    domain: '99app.com',
    fallbackIcon: UtensilsCrossed,
    bgColor: 'bg-amber-50',
    color: '#F48000',
    logoUrl: 'https://99app.com/wp-content/themes/99app/assets/images/favicon.png'
  },
  entrega_aki: {
    domain: 'delivery.local',
    fallbackIcon: Globe,
    bgColor: 'bg-emerald-50',
    color: '#16422B',
    logoUrl: null
  },
  notion: {
    domain: 'notion.so',
    fallbackIcon: Globe,
    bgColor: 'bg-stone-50',
    color: '#000000',
    logoUrl: 'https://www.notion.so/front-static/favicon.ico'
  },
  erp: {
    domain: '',
    fallbackIcon: Database,
    bgColor: 'bg-emerald-50',
    color: '#059669',
    logoUrl: null
  },
  business_analytics: {
    domain: 'analytics.local',
    fallbackIcon: TrendingUp,
    bgColor: 'bg-rose-50',
    color: '#E11D48',
    logoUrl: null
  },

  // Atendimento & Chamados
  chat: {
    domain: 'chatwoot.com',
    fallbackIcon: MessageSquare,
    bgColor: 'bg-purple-50',
    color: '#1F93FF',
    logoUrl: 'https://www.chatwoot.com/favicon.ico'
  },
  chatwoot: {
    domain: 'chatwoot.com',
    fallbackIcon: MessageSquare,
    bgColor: 'bg-purple-50',
    color: '#1F93FF',
    logoUrl: 'https://www.chatwoot.com/favicon.ico'
  },
  freescout: {
    domain: 'freescout.net',
    fallbackIcon: Headphones,
    bgColor: 'bg-indigo-50',
    color: '#2887E0',
    logoUrl: 'https://freescout.net/wp-content/uploads/2018/12/favicon-1.png'
  },

  // Financeiro & RH
  contaazul: {
    domain: 'contaazul.com',
    fallbackIcon: CircleDollarSign,
    bgColor: 'bg-teal-50',
    color: '#00A4D8',
    logoUrl: 'https://contaazul.com/favicon.ico'
  },
  bank: {
    domain: 'pluggy.ai',
    fallbackIcon: Landmark,
    bgColor: 'bg-amber-50',
    color: '#D97706',
    logoUrl: 'https://pluggy.ai/favicon.ico'
  },
  marqhr: {
    domain: 'marqhr.com.br',
    fallbackIcon: Clock,
    bgColor: 'bg-rose-50',
    color: '#E11D48',
    logoUrl: 'https://marqhr.com.br/favicon.ico'
  },
  intranetmall: {
    domain: 'intranetmall.com.br',
    fallbackIcon: Building2,
    bgColor: 'bg-amber-50',
    color: '#B45309',
    logoUrl: 'https://app3.intranetmall.com/favicon.ico'
  },
  meta_ads: {
    domain: 'meta.com',
    fallbackIcon: Megaphone,
    bgColor: 'bg-blue-50',
    color: '#1877F2',
    logoUrl: 'https://static.xx.fbcdn.net/rsrc.php/yb/r/cf0wzSeparate.ico'
  },

  // Canais & Mensageria
  telegram: {
    domain: 'telegram.org',
    fallbackIcon: Send,
    bgColor: 'bg-sky-50',
    color: '#2AABEE',
    logoUrl: 'https://telegram.org/favicon.ico'
  },
  whatsapp: {
    domain: 'whatsapp.com',
    fallbackIcon: MessageSquare,
    bgColor: 'bg-emerald-50',
    color: '#25D366',
    logoUrl: 'https://static.whatsapp.net/rsrc.php/v3/yP/r/rNqcCO-XYgw.png'
  },
  webhook: {
    domain: '',
    fallbackIcon: Globe,
    bgColor: 'bg-orange-50',
    color: '#CA3D26',
    logoUrl: null
  },
  cron: {
    domain: '',
    fallbackIcon: Clock,
    bgColor: 'bg-blue-50',
    color: '#2563EB',
    logoUrl: null
  },
  custom: {
    domain: '',
    fallbackIcon: Zap,
    bgColor: 'bg-amber-50',
    color: '#D97706',
    logoUrl: null
  },
  agent: {
    domain: '',
    fallbackIcon: Bot,
    bgColor: 'bg-emerald-50',
    color: '#16422B',
    logoUrl: null
  }
};

/**
 * Componente PlatformLogo:
 * Renderiza o logo oficial da empresa/ferramenta com ajuste exato de tamanho
 * e fallback automático para o ícone vetorial caso a imagem falhe.
 */
export function PlatformLogo({
  type,
  size = 'md', // 'sm' (16px), 'md' (20px), 'lg' (24px)
  className = '',
  alt = ''
}) {
  const [imgError, setImgError] = useState(false);
  const cleanType = (type || '').toLowerCase().replace(/_event$/, '').replace(/-/g, '_');
  const meta = LOGO_MAP[cleanType] || LOGO_MAP[type] || {
    domain: '',
    fallbackIcon: Globe,
    bgColor: 'bg-gray-50',
    color: '#4B5563',
    logoUrl: null
  };

  const IconComp = meta.fallbackIcon || Globe;

  const sizeClasses = {
    xs: 'w-3.5 h-3.5',
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  }[size] || 'w-5 h-5';

  const iconSizeClasses = {
    xs: 'w-3 h-3',
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  }[size] || 'w-4 h-4';

  // Se tiver URL de logo e não tiver dado erro, tenta carregar a imagem oficial
  // Caso contrário, tenta o favicon oficial do domínio
  const candidateUrl = !imgError
    ? meta.logoUrl || (meta.domain ? `https://www.google.com/s2/favicons?domain=${meta.domain}&sz=64` : null)
    : null;

  if (candidateUrl) {
    return (
      <img
        src={candidateUrl}
        alt={alt || meta.domain || cleanType}
        onError={() => setImgError(true)}
        className={`${sizeClasses} rounded-md object-contain shrink-0 ${className}`}
        loading="lazy"
      />
    );
  }

  return (
    <IconComp
      className={`${iconSizeClasses} shrink-0 ${className}`}
      style={{ color: meta.color }}
    />
  );
}
