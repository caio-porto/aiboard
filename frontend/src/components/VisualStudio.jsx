import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  MarkerType,
  BaseEdge,
  getBezierPath,
  getSmoothStepPath
} from '@xyflow/react';

import { AgentNode } from './AgentNode';
import { ToolNode } from './ToolNode';
import { TriggerNode } from './TriggerNode';
import { ContextMenu, TOOL_PRESETS, TRIGGER_PRESETS, getFilteredToolPresets, getFilteredTriggerPresets } from './ContextMenu';
import { AgentMemoryDrawer } from './AgentMemoryDrawer';
import { AgentPersonalityDrawer } from './AgentPersonalityDrawer';
import { AgentWorkspaceDrawer } from './AgentWorkspaceDrawer';
import { TownHallModal } from './TownHallModal';
import { CanvasHistoryModal } from './CanvasHistoryModal';
import { CatalogModal } from './CatalogModal';
import { MarkdownRenderer } from './MarkdownRenderer';
import { CompanyLogo } from './CompanyLogo';
import { PlatformLogo } from './PlatformLogo';
import { TaskLiveModal } from './TaskLiveModal';
import { DEFAULT_DEPARTMENTS } from './DepartmentManagerModal';
import { formatBrtTestedAt } from '../utils/dateUtils';
import { computeElkCompoundLayout } from '../utils/elkClusterLayout';
import { useLanguage } from '../i18n';
import {
  Layers,
  Bot,
  Plus,
  Save,
  RotateCcw,
  LayoutGrid,
  Sliders,
  X,
  Sparkles,
  Undo2,
  Redo2,
  Trash2,
  Copy,
  Brain,
  Smile,
  Building2,
  Lock,
  CheckCircle2,
  Eye,
  EyeOff,
  Edit3,
  Radio,
  Cpu,
  Zap,
  Globe,
  Clock,
  Crown,
  Wrench,
  PlusCircle,
  Calendar,
  Check,
  ChevronRight,
  Mail,
  Terminal,
  Activity,
  AlertTriangle,
  Megaphone,
  Target,
  Laptop,
  MousePointer,
  History as HistoryIcon,
  FileText,
  Search,
  ShieldCheck,
  ShieldAlert,
  ShoppingBag,
  UtensilsCrossed,
  ChevronDown,
  Users
} from 'lucide-react';

// Tipos de nós registrados fora do componente
const nodeTypes = {
  agent: AgentNode,
  tool: ToolNode,
  trigger: TriggerNode
};

// Aresta com aproximação suave e perpendicular para o marcador (garante que a linha entra 100% alinhada por trás da seta, sem vazamento lateral ou lacunas)
export function CustomCleanEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  markerStart
}) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
    offset: 20
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={style}
      markerEnd={markerEnd}
      markerStart={markerStart}
    />
  );
}

const edgeTypes = {
  bezier: CustomCleanEdge,
  default: CustomCleanEdge,
  custom: CustomCleanEdge
};

const DELIVERY_PLATFORMS_META = {
  entrega_aki_event: {
    platformName: 'Entrega Aki (Delivery Próprio)',
    bannerType: 'warning',
    bannerTitle: '⚠️ Gestor Web (gestor.entregaaki.app.br) — Licença Única',
    bannerText: 'O Gestor Web possui apenas 1 licença de acesso simultâneo. Para não derrubar a sessão do caixa físico da loja durante o expediente comercial, o acesso automatizado ao gestor é restrito ao turno da noite (22h30 às 08h30). Durante o dia, a consulta de produtos e preços é realizada diretamente via ERP Operacional (Classe Delivery).',
    specs: [
      { label: 'Portal Gestor Web:', value: 'gestor.entregaaki.app.br', badge: 'Licença Única' },
      { label: 'Janela de Acesso ao Gestor:', value: '22h30 às 08h30 (Loja Fechada)', badge: 'Segurança Operacional' },
      { label: 'Consulta Diurna (Produtos e Preços):', value: 'ERP Operacional (Classe Delivery)', badge: 'Local DB' },
      { label: 'Vitrine Online Monitorada:', value: 'Vitrine Oficial', badge: 'Vitrine Pública' }
    ],
    defaultCauses: ['order_status', 'store_catalog', 'order_chat_message', 'customer_review'],
    causes: [
      { id: 'order_status', icon: '🚨', label: 'Status & Cancelamento (Radar ERP)', desc: 'Detecção imediata de cancelamentos pelo banco local do ERP' },
      { id: 'store_catalog', icon: '🏪', label: 'Loja Aberta / Fechada (Vitrine)', desc: 'Verificação da vitrine oficial de delivery' },
      { id: 'order_chat_message', icon: '💬', label: 'Mensagens no Chat do Pedido Aberto', desc: 'Dúvidas e mensagens enviadas pelo cliente no chat do pedido em andamento' },
      { id: 'customer_review', icon: '⭐', label: 'Avaliações Críticas (< 5 Estrelas)', desc: 'Feedbacks negativos e notas abaixo de 5 estrelas para mediação imediata' }
    ]
  },
  ifood_event: {
    platformName: 'iFood Marketplace (Webhook & Radar ERP)',
    bannerType: 'success',
    bannerTitle: 'Sessão Portal do Parceiro Conectada',
    bannerText: 'Integração oficial autorizada via sessão do lojista (portal.ifood.com.br). Escuta pedidos, cancelamentos e status de loja com confirmação e retaguarda no Radar ERP, sem exigência de CNAE Tech.',
    specs: [
      { label: 'Portal do Parceiro:', value: 'portal.ifood.com.br', badge: 'Sessão Ativa' },
      { label: 'Mecanismo de Escuta:', value: 'Sessão Portal + Webhook + Radar ERP', badge: 'Multi-Canal' },
      { label: 'Loja Autenticada:', value: 'Unidade Principal', badge: 'Conectado' },
      { label: 'Retaguarda ERP:', value: 'Radar de Cancelamentos ERP Operacional', badge: 'Local DB' }
    ],
    defaultCauses: ['ifood_polling', 'order_status', 'store_catalog', 'order_chat_message', 'customer_review'],
    causes: [
      { id: 'ifood_polling', icon: '📦', label: 'Fila de Pedidos & Eventos (Webhook & Radar)', desc: 'Novos pedidos e eventos de delivery recebidos via webhook e retaguarda no ERP' },
      { id: 'order_status', icon: '🚨', label: 'Cancelamentos & Rejeições', desc: 'Notificação imediata de cancelamento pelo iFood e pelo ERP' },
      { id: 'store_catalog', icon: '🏪', label: 'Status da Loja (Aberta/Fechada)', desc: 'Monitora pausas emergenciais e disponibilidade de operação' },
      { id: 'order_chat_message', icon: '💬', label: 'Mensagens no Chat do Pedido Aberto', desc: 'Dúvidas e mensagens enviadas no chat do pedido ativo (recebidas via webhook/hub)' },
      { id: 'customer_review', icon: '⭐', label: 'Avaliações Críticas (< 5 Estrelas)', desc: 'Notas abaixo de 5 estrelas e feedbacks de clientes para mediação imediata' }
    ]
  },
  '99food_event': {
    platformName: '99 Food Marketplace',
    bannerType: 'neutral',
    bannerTitle: '🔍 Conector Reverso: Portal do Lojista + Radar ERP',
    bannerText: 'Automação via Playwright com interceptação de rede no portal do lojista (merchant.99app.com) para descobrir endpoints REST internos e autenticação tokenizada, combinada com o Radar ERP.',
    specs: [
      { label: 'Portal do Lojista:', value: 'merchant.99app.com', badge: 'Portal Web' },
      { label: 'Mecanismo de Captura:', value: 'Playwright Headless + Request Interception', badge: 'Token REST' },
      { label: 'Retaguarda ERP:', value: 'Radar de Cancelamentos ERP Operacional', badge: 'Local DB' }
    ],
    defaultCauses: ['order_status', 'store_catalog', 'sla_delay', 'order_chat_message', 'customer_review'],
    causes: [
      { id: 'order_status', icon: '🚨', label: 'Status & Cancelamento', desc: 'Cancelamentos e solicitações críticas de suporte' },
      { id: 'store_catalog', icon: '🏪', label: 'Status da Loja & Cardápio', desc: 'Auditoria de abertura de loja e itens disponíveis' },
      { id: 'sla_delay', icon: '⏱️', label: 'Alerta de SLA / Espera', desc: 'Avisos quando o tempo de preparo ou coleta ultrapassa a tolerância' },
      { id: 'order_chat_message', icon: '💬', label: 'Mensagens no Chat do Pedido Aberto', desc: 'Mensagens de clientes ou entregadores em pedidos em andamento (recebidas via webhook/hub)' },
      { id: 'customer_review', icon: '⭐', label: 'Avaliações Críticas (< 5 Estrelas)', desc: 'Feedbacks negativos ou notas abaixo de 5 estrelas registradas por clientes' }
    ]
  }
};


// Organograma Executivo C-Level & Departamentos (CEO, CFO, COO, CMO + Sub-agentes e Ferramentas MCP)
const initialNodes = [
  {
    "id": "trig-telegram",
    "type": "trigger",
    "position": {
      "x": 740,
      "y": 30
    },
    "data": {
      "label": "Bot do Telegram",
      "type": "telegram",
      "subtitle": "Escutando Comandos"
    }
  },
  {
    "id": "trig-web",
    "type": "trigger",
    "position": {
      "x": 1020,
      "y": 30
    },
    "data": {
      "label": "Console Web",
      "type": "web",
      "subtitle": "Chat Executivo Corporativo"
    }
  },
  {
    "id": "agent-ceo",
    "type": "agent",
    "position": {
      "x": 880,
      "y": 160
    },
    "data": {
      "role": "CEO - Diretor Geral & Orquestrador Executivo",
      "name": "Central Executiva & Estratégia",
      "goal": "Atuar como Diretor Geral da empresa, coordenando as diretorias (CFO, COO, CMO, CPO) para consolidar a visão executiva e garantir resolução autônoma:\n\n1. Escopo de Atuação: Consolidar faturamento do ERP, despesas financeiras, rupturas operacionais, SLA de delivery e métricas de campanhas em um único Boletim Executivo.\n2. Trava Anti-Alucinação: Nunca inventar números de vendas ou métricas. Toda afirmação deve ser baseada nos dados extraídos pelas ferramentas dos diretores especializados. Se houver divergência entre fontes, aponte a discrepância.\n3. Formato de Saída: Resumo executivo em tópicos diretos (Status, Diagnóstico, Ação Executada, Decisão Pendente) e disparo de alertas críticos aos gestores via Telegram.",
      "model": "Gemini 3.8 Flash Medium",
      "isLead": true,
      "department": "executivo",
      "isCLevel": true,
      "toolsCount": 0,
      "scheduledTasks": [
        {
          "id": "task-ceo-profit",
          "title": "Comitê Executivo Noturno de Resultados",
          "frequency": "Diariamente às 23:45",
          "cron": "45 23 * * *",
          "instruction": "Reunir CFO, COO, CMO e CPO para cruzar faturamento do dia no ERP, custos financeiros, despesas e performance de campanhas, gerando o Boletim Executivo com plano de ação estratégico para o dia seguinte.",
          "active": true
        }
      ]
    }
  },
  {
    "id": "agent-cfo",
    "type": "agent",
    "position": {
      "x": 280,
      "y": 440
    },
    "data": {
      "role": "CFO - Diretor Financeiro & Controladoria",
      "name": "Guardião do Caixa & Margens",
      "goal": "Garantir a saúde financeira, liquidez de caixa e controle rigoroso de custos e margens da empresa:\n\n1. Escopo de Atuação: Supervisionar contas a pagar, conciliação bancária, DRE, apuração de CMV e cumprimento dos prazos fiscais da contabilidade.\n2. Soberania do Extrato Bancário: O extrato bancário é a fonte primária da verdade sobre saídas de caixa. Diferenciar rigorosamente entre 'Inadimplência Real' (falta de débito no banco) e 'Pendência Contábil de Baixa' (débito já realizado na conta bancária mas título pendente de conciliação no ERP Financeiro).\n3. Trava Anti-Alucinação & Segurança Financeira: Proibido aprovar alertas de pânico ou sugerir pagamentos de contas que já saíram do extrato bancário. Relatar apenas números reais auditados.\n4. Regra de Alerta: Disparar alerta imediato no Telegram caso o saldo consolidado seja insuficiente para cobrir as saídas do dia ou se houver risco de juros/multas por conta efetivamente não quitada no banco.",
      "model": "Gemini 3.8 Flash Medium",
      "isLead": false,
      "department": "financeiro",
      "isCLevel": true,
      "toolsCount": 0
    }
  },
  {
    "id": "agent-cfo-payable",
    "type": "agent",
    "position": {
      "x": 280,
      "y": 720
    },
    "data": {
      "role": "Auditor de Contas a Pagar & Conciliação Bancária",
      "name": "Auditoria de Faturas & Vencimentos",
      "goal": "Auditar faturas, contas a pagar e conciliar 100% dos lançamentos bancários da empresa:\n\n1. Escopo de Atuação: Localizar faturas no Gmail financeiro, auditar lançamentos no ERP Financeiro, cruzar lançamentos com os débitos nos extratos bancários e checar DDA.\n2. Soberania Absoluta do Extrato Bancário & Cruzamento por Valor:\n   - A verdade definitiva sobre a liquidação de uma conta é a saída de caixa no extrato bancário. Se um débito correspondente ao valor exato da fatura constar no extrato do dia, O TÍTULO ESTÁ EFETAMENTE PAGO.\n   - NUNCA classifique uma despesa como \"não paga\", \"crítica em aberto\" ou \"pendente de débito\" apenas porque ela consta com status \"Em Aberto\" no ERP Financeiro. Se o valor saiu da conta corrente, ela está 100% PAGA. Trata-se exclusivamente de uma pendência administrativa de baixa manual/conciliação no ERP.\n3. Regra Anti-Alucinação & Mapeamento de Favorecidos:\n   - Faça sempre a busca reversa por VALOR EXATO centavo a centavo.\n   - Proibido sugerir aos gestores o pagamento de contas que já foram debitadas no banco, evitando o risco gravíssimo de pagamento em duplicidade.\n4. Regra de Notificação & Alerta:\n   - 🔴 ALERTA CRÍTICO NO TELEGRAM: Disparar EXCLUSIVAMENTE para títulos cujo vencimento é hoje e que NÃO possuem débito no extrato bancário NEM agendamento confirmado no internet banking.\n   - 🟢 PAGO NO BANCO / PENDENTE DE BAIXA NO ERP: Listar como recomendação de conciliação interna, sem alarmismo ou pedido de autorização de pagamento.",
      "model": "Gemini 3.8 Flash Medium",
      "isLead": false,
      "department": "financeiro",
      "isCLevel": false,
      "toolsCount": 3
    }
  },
  {
    "id": "agent-cfo-profit",
    "type": "agent",
    "position": {
      "x": 280,
      "y": 1040
    },
    "data": {
      "role": "Analista de DRE, Margem de Contribuição & Custos",
      "name": "Apuração de Resultados & CMV",
      "goal": "Apurar a rentabilidade real da operação, calculando CMV, despesas operacionais e margem de contribuição:\n\n1. Escopo de Atuação: Cruzar faturamento líquido no ERP Operacional com custo de insumos vendidos e descontar taxas de cartões e marketplaces.\n2. Trava Anti-Alucinação: Utilizar estritamente os custos das fichas técnicas cadastradas e taxas reais contratuais. Caso uma taxa ou custo não esteja registrado, indicar expressamente a ausência do dado.\n3. Formato de Saída: Entregar tabela estruturada: Faturamento Bruto, Deduções/Taxas, Faturamento Líquido, CMV Total (R$ e %), Margem de Contribuição e Lucro Operacional.",
      "model": "Gemini 3.8 Flash Medium",
      "isLead": false,
      "department": "financeiro",
      "isCLevel": false,
      "toolsCount": 2
    }
  },
  {
    "id": "tool-gmail",
    "type": "tool",
    "position": {
      "x": -20,
      "y": 680
    },
    "data": {
      "name": "Gmail Corporativo",
      "category": "Comunicação & Faturas",
      "type": "gmail",
      "side": "left"
    }
  },
  {
    "id": "tool-contaazul",
    "type": "tool",
    "position": {
      "x": -20,
      "y": 790
    },
    "data": {
      "name": "ERP Financeiro",
      "category": "Contas a Pagar & Fiscal",
      "type": "contaazul",
      "side": "left"
    }
  },
  {
    "id": "tool-bank",
    "type": "tool",
    "position": {
      "x": -20,
      "y": 900
    },
    "data": {
      "name": "Extratos Bancários",
      "category": "Conciliação PJ & Saldos",
      "type": "bank",
      "side": "left"
    }
  },
  {
    "id": "tool-business",
    "type": "tool",
    "position": {
      "x": -20,
      "y": 1040
    },
    "data": {
      "name": "Business Analytics",
      "category": "Métricas & KPIs Executivos",
      "type": "business",
      "side": "left"
    }
  },
  {
    "id": "tool-dre",
    "type": "tool",
    "position": {
      "x": -20,
      "y": 1150
    },
    "data": {
      "name": "DRE Gerencial",
      "category": "DRE & Demonstrações",
      "type": "dre",
      "side": "left"
    }
  },
  {
    "id": "agent-coo",
    "type": "agent",
    "position": {
      "x": 880,
      "y": 440
    },
    "data": {
      "role": "COO - Diretor de Operações & Logística",
      "name": "Diretoria de Operações",
      "goal": "Garantir o funcionamento contínuo e impecável das unidades físicas e dos canais de delivery:\n\n1. Escopo de Atuação: Monitorar abertura e fechamento de operação, conformidade com normas operacionais, abastecimento ininterrupto de insumos e cumprimento dos SLAs operacionais.\n2. Trava Anti-Alucinação: Basear diagnósticos exclusivamente nas consultas ao ERP Operacional e dados dos canais integrados. Não emitir palpites subjetivos.\n3. Regra de Resolução: Se detectar operação fechada indevidamente ou atraso crítico em pedidos, acionar os gestores no Telegram.",
      "model": "Gemini 3.8 Flash Medium",
      "isLead": false,
      "department": "operacoes",
      "isCLevel": true,
      "toolsCount": 0
    }
  },
  {
    "id": "agent-coo-stock",
    "type": "agent",
    "position": {
      "x": 880,
      "y": 720
    },
    "data": {
      "role": "Gestor de Estoque, Insumos & Auditor de ERP",
      "name": "Auditoria de Estoque & Suprimentos",
      "goal": "Controlar o inventário de insumos e embalagens da empresa para garantir ruptura zero (zero stockout):\n\n1. Escopo de Atuação: Monitorar no ERP Operacional a saída diária de insumos chave e calcular dias restantes de estoque.\n2. Trava Anti-Alucinação: Respeitar rigidamente os saldos do ERP e contagens físicas do Google Drive. Nunca estimar quantidades. Apontar o saldo real e a data da última contagem.\n3. Regra de Ação: Identificando qualquer insumo próximo do estoque mínimo de segurança, emitir sugestão exata de pedido de compra local ou reposição.",
      "model": "Gemini 3.8 Flash Medium",
      "isLead": false,
      "department": "operacoes",
      "isCLevel": false,
      "toolsCount": 1
    }
  },
  {
    "id": "agent-coo-logistics",
    "type": "agent",
    "position": {
      "x": 880,
      "y": 1360
    },
    "data": {
      "role": "Planejador de Suprimentos & Logística",
      "name": "Planejamento de Compras & Estoque (MRP)",
      "goal": "Planejar semanalmente o abastecimento de insumos e embalagens usando metodologia MRP (Média Móvel Ponderada + Curva Sazonal + PAR Level + Days of Supply):\n\n1. Escopo de Atuação: Executar a explosão de vendas reais pelas fichas técnicas (BOM), cruzar com a planilha semanal de contagem física no Google Drive e o saldo do ERP Operacional, estimar dias restantes de cobertura e data provável de ruptura.\n2. Segmentação por Fornecedor: Separar recomendações por ciclo operacional e centro de distribuição.\n3. Trava Anti-Alucinação: Utilizar exclusivamente os números calculados pelas ferramentas determinísticas de estoque. Jamais inventar saldos ou quantidades.",
      "model": "Gemini 3.8 Flash Medium",
      "isLead": false,
      "department": "operacoes",
      "isCLevel": false,
      "toolsCount": 2,
      "scheduledTasks": [
        {
          "id": "task-coo-monday-mrp",
          "title": "Planejamento Semanal de Estoque & Reposição de Insumos (MRP)",
          "frequency": "Toda Segunda-feira às 08:00",
          "cron": "0 8 * * 1",
          "instruction": "Auditar o estoque operacional e gerar o Plano Semanal de Compras e Retirada de Insumos destacando itens críticos, cobertura em dias (Days of Supply) e plano de reposição segmentado por fornecedor.",
          "active": true
        }
      ]
    }
  },
  {
    "id": "agent-coo-manuals",
    "type": "agent",
    "position": {
      "x": 880,
      "y": 1040
    },
    "data": {
      "role": "Auditor de Processos & Procedimentos Operacionais",
      "name": "Auditor de Processos & POPs",
      "goal": "Garantir padronização rigorosa dos processos e rotinas operacionais da empresa:\n\n1. Escopo de Atuação: Responder dúvidas técnicas da equipe consultando exclusivamente as fichas técnicas oficiais e POPs de abertura/fechamento.\n2. Trava Anti-Alucinação: Proibido sugerir procedimentos alternativos por conta própria. Toda resposta deve citar a documentação oficial arquivada no Google Drive/Notion.\n3. Formato de Resposta: Passo a passo claro, medidas exatas e avisos de segurança operacional.",
      "model": "Gemini 3.8 Flash Medium",
      "isLead": false,
      "department": "operacoes",
      "isCLevel": false,
      "toolsCount": 2
    }
  },
  {
    "id": "tool-erp",
    "type": "tool",
    "position": {
      "x": 1200,
      "y": 720
    },
    "data": {
      "name": "ERP Operacional",
      "category": "Vendas, Pedidos & Estoque",
      "type": "erp",
      "side": "right"
    }
  },
  {
    "id": "tool-drive",
    "type": "tool",
    "position": {
      "x": 1200,
      "y": 990
    },
    "data": {
      "name": "Google Drive & Docs",
      "category": "Documentos & Processos",
      "type": "drive",
      "side": "right"
    }
  },
  {
    "id": "tool-freescout",
    "type": "tool",
    "position": {
      "x": 1200,
      "y": 1100
    },
    "data": {
      "name": "Central de Helpdesk",
      "category": "Chamados & Suporte Interno",
      "type": "freescout",
      "side": "right"
    }
  },
  {
    "id": "agent-cmo",
    "type": "agent",
    "position": {
      "x": 1480,
      "y": 440
    },
    "data": {
      "role": "CMO - Diretor de Marketing & Crescimento",
      "name": "Estrategista de Marca & Growth",
      "goal": "Gerenciar o crescimento sustentável da marca, alinhando aquisição de clientes com a capacidade produtiva:\n\n1. Escopo de Atuação: Supervisionar tráfego pago (Meta Ads / Google Ads), copies promocionais, reputação nos canais digitais e atendimento ao cliente no WhatsApp/Chatwoot.\n2. Trava Anti-Alucinação: Nunca anunciar ou promover itens com estoque baixo ou zerado no ERP. Cruzar sempre a vitrine de marketing com a disponibilidade real de insumos.\n3. Formato de Saída: Relatório executivo de aquisição (CAC, ROAS, novos clientes) e preservação da satisfação média (NPS/Nota acima de 4.8).",
      "model": "Gemini 3.8 Flash Medium",
      "isLead": false,
      "department": "marketing",
      "isCLevel": true,
      "toolsCount": 0
    }
  },
  {
    "id": "agent-cmo-ads",
    "type": "agent",
    "position": {
      "x": 1480,
      "y": 960
    },
    "data": {
      "role": "Gestor de Performance & Tráfego Pago",
      "name": "Otimizador de Campanhas Pagas",
      "goal": "Otimizar os investimentos de anúncios digitais para atrair fluxo qualificado e conversões:\n\n1. Escopo de Atuação: Analisar campanhas no Meta Ads e Google Ads, monitorando valor investido, cliques (CPC), custo por mensagem (CPA), alcance geográfico e retorno (ROAS).\n2. Trava Anti-Alucinação: Utilizar estritamente as métricas retornadas pelas ferramentas de Ads. Proibido arredondar ou supor conversões sem registro na plataforma.\n3. Regra de Otimização: Identificar anúncios com frequência alta (> 3.5) gerando fadiga criativa e sugerir realocação de orçamento para criativos com melhor custo por resultado.",
      "model": "Gemini 3.8 Flash Medium",
      "isLead": false,
      "department": "marketing",
      "isCLevel": false,
      "toolsCount": 1
    }
  },
  {
    "id": "agent-cmo-sac",
    "type": "agent",
    "position": {
      "x": 1480,
      "y": 1200
    },
    "data": {
      "role": "Especialista em Experiência do Cliente & SAC",
      "name": "Gestão de Atendimento & SAC",
      "goal": "Atender clientes no Chatwoot (WhatsApp) e canais digitais com comunicação 100% humana, direta e resolutiva:\n\n1. Escopo de Atuação: Atender clientes no WhatsApp e canais integrados com linguagem natural, ágil e acolhedora, tirando dúvidas e solucionando ocorrências operacionais.\n2. Tom de Voz 100% Humano & Anti-Robótico:\n   - Proibido usar mensagens padronizadas de chatbot, clichês de script ou respostas prolixas.\n   - Anti-Sycophancy (Sem Bajulação): Não bajular nem usar frases subservientes. Seja simpático, educado e vá direto ao ponto.\n   - Respostas Proporcionais: Para saudações simples ('Boa tarde'), responda de forma curta e humana ('Boa tarde, [Nome]! Tudo bem? Como posso te ajudar?'). Máximo de 0 a 1 emoji simples.\n3. Trava Anti-Alucinação: Nunca prometer reembolsos ou substituições sem verificar o pedido no ERP Operacional.\n4. Regra de Escalação: Se o cliente expressar forte insatisfação, relatar problema de qualidade ou exigir cancelamento, acionar imediatamente o Telegram dos gestores.",
      "model": "Gemini 3.8 Flash Medium",
      "isLead": false,
      "department": "marketing",
      "isCLevel": false,
      "toolsCount": 1
    }
  },
  {
    "id": "tool-chatwoot",
    "type": "tool",
    "position": {
      "x": 1800,
      "y": 1200
    },
    "data": {
      "name": "Chatwoot Omnichannel",
      "category": "Atendimento & Mensageria",
      "type": "chat",
      "side": "right"
    }
  },
  {
    "id": "agent-cpo",
    "type": "agent",
    "position": {
      "x": 2080,
      "y": 440
    },
    "data": {
      "role": "CHRO - Diretor de Gente, Cultura & Compliance",
      "name": "Guardião de Pessoas & Cultura",
      "goal": "Garantir ambiente de trabalho saudável, equipe completa e conformidade total com a legislação trabalhista:\n\n1. Escopo de Atuação: Supervisionar escalas de trabalho, conferência de folha e ponto, planos de treinamento e controle de faltas e atestados.\n2. Trava Anti-Alucinação: Seguir estritamente as regras da legislação trabalhista e acordos coletivos. Não flexibilizar intervalos intrajornada ou limites de hora extra.\n3. Regra de Gestão: Alertar com antecedência sobre férias a vencer para evitar pagamento em dobro e monitorar turnover da equipe.",
      "model": "Gemini 3.8 Flash Medium",
      "isLead": false,
      "department": "rh",
      "isCLevel": true,
      "toolsCount": 0
    }
  }
];

const initialEdges = [
  {
    "id": "e-trig-telegram-ceo",
    "source": "trig-telegram",
    "target": "agent-ceo",
    "type": "custom"
  },
  {
    "id": "e-trig-web-ceo",
    "source": "trig-web",
    "target": "agent-ceo",
    "type": "custom"
  },
  {
    "id": "e-ceo-cfo",
    "source": "agent-ceo",
    "target": "agent-cfo",
    "type": "custom"
  },
  {
    "id": "e-ceo-coo",
    "source": "agent-ceo",
    "target": "agent-coo",
    "type": "custom"
  },
  {
    "id": "e-ceo-cmo",
    "source": "agent-ceo",
    "target": "agent-cmo",
    "type": "custom"
  },
  {
    "id": "e-ceo-cpo",
    "source": "agent-ceo",
    "target": "agent-cpo",
    "type": "custom"
  },
  {
    "id": "e-cfo-payable",
    "source": "agent-cfo",
    "target": "agent-cfo-payable",
    "type": "custom"
  },
  {
    "id": "e-cfo-profit",
    "source": "agent-cfo",
    "target": "agent-cfo-profit",
    "type": "custom"
  },
  {
    "id": "e-tool-gmail-payable",
    "source": "tool-gmail",
    "target": "agent-cfo-payable",
    "type": "custom"
  },
  {
    "id": "e-tool-contaazul-payable",
    "source": "tool-contaazul",
    "target": "agent-cfo-payable",
    "type": "custom"
  },
  {
    "id": "e-tool-bank-payable",
    "source": "tool-bank",
    "target": "agent-cfo-payable",
    "type": "custom"
  },
  {
    "id": "e-tool-business-profit",
    "source": "tool-business",
    "target": "agent-cfo-profit",
    "type": "custom"
  },
  {
    "id": "e-tool-dre-profit",
    "source": "tool-dre",
    "target": "agent-cfo-profit",
    "type": "custom"
  },
  {
    "id": "e-coo-stock",
    "source": "agent-coo",
    "target": "agent-coo-stock",
    "type": "custom"
  },
  {
    "id": "e-coo-manuals",
    "source": "agent-coo",
    "target": "agent-coo-manuals",
    "type": "custom"
  },
  {
    "id": "e-coo-logistics",
    "source": "agent-coo",
    "target": "agent-coo-logistics",
    "type": "custom"
  },
  {
    "id": "e-tool-erp-logistics",
    "source": "tool-erp",
    "target": "agent-coo-logistics",
    "type": "custom"
  },
  {
    "id": "e-tool-drive-logistics",
    "source": "tool-drive",
    "target": "agent-coo-logistics",
    "type": "custom"
  },
  {
    "id": "e-tool-erp-stock",
    "source": "tool-erp",
    "target": "agent-coo-stock",
    "type": "custom"
  },
  {
    "id": "e-tool-drive-manuals",
    "source": "tool-drive",
    "target": "agent-coo-manuals",
    "type": "custom"
  },
  {
    "id": "e-tool-freescout-manuals",
    "source": "tool-freescout",
    "target": "agent-coo-manuals",
    "type": "custom"
  },
  {
    "id": "e-cmo-ads",
    "source": "agent-cmo",
    "target": "agent-cmo-ads",
    "type": "custom"
  },
  {
    "id": "e-cmo-sac",
    "source": "agent-cmo",
    "target": "agent-cmo-sac",
    "type": "custom"
  },
  {
    "id": "e-tool-chatwoot-sac",
    "source": "tool-chatwoot",
    "target": "agent-cmo-sac",
    "type": "custom"
  }
];

// Formata timestamp do último teste de ferramenta
const formatTestedAt = (ts) => formatBrtTestedAt(ts);

export function VisualStudio({ user }) {
  const { t, tr } = useLanguage();
  const isAdmin = user?.role === 'admin';

  // Inicializa a partir do cache local da topologia real; se vazio, inicia com array vazio para nunca exibir organograma demo aleatório
  const [nodes, setNodes] = useState(() => {
    try {
      const cached = localStorage.getItem('aiboard_canvas_topology_cache') || localStorage.getItem('aiboard_flow_nodes_v2');
      if (cached) {
        const parsed = JSON.parse(cached);
        const list = Array.isArray(parsed) ? parsed : parsed.nodes;
        if (Array.isArray(list) && list.length > 0) {
          return list.map((n) => ({ ...n, selected: false }));
        }
      }
    } catch (e) {}
    return [];
  });
  const [edges, setEdges] = useState(() => {
    try {
      const cached = localStorage.getItem('aiboard_canvas_topology_cache') || localStorage.getItem('aiboard_flow_edges_v2');
      if (cached) {
        const parsed = JSON.parse(cached);
        const list = Array.isArray(parsed) ? parsed : parsed.edges;
        if (Array.isArray(list)) {
          return list.map((e) => ({ ...e, selected: false }));
        }
      }
    } catch (e) {}
    return [];
  });

  const [selectedNode, setSelectedNode] = useState(null);
  const [savedToast, setSavedToast] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [rfInstance, setRfInstance] = useState(null);
  const [optimizationModal, setOptimizationModal] = useState(null);
  const [showDeliveryPassword, setShowDeliveryPassword] = useState(false);
  const clipboardNodeRef = useRef(null);
  const mouseScreenPosRef = useRef(null);

  // Modo de navegação do canvas: Trackpad (2 dedos movem a tela) vs Mouse (roda dá zoom)
  const [panOnScroll, setPanOnScroll] = useState(() => {
    try {
      const saved = localStorage.getItem('aiboard_pan_on_scroll');
      return saved !== null ? saved === 'true' : true;
    } catch (e) {
      return true;
    }
  });

  const togglePanMode = () => {
    setPanOnScroll((prev) => {
      const nextVal = !prev;
      try {
        localStorage.setItem('aiboard_pan_on_scroll', String(nextVal));
      } catch (e) {}
      return nextVal;
    });
  };

  // Alerta preventivo se o usuário tentar fechar ou recarregar a aba com alterações pendentes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'Existem alterações não salvas no fluxo de agentes. Deseja realmente sair?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Modais e Gavetas Específicas
  const [memoryAgent, setMemoryAgent] = useState(null);
  const [personalityAgent, setPersonalityAgent] = useState(null);
  const [workspaceAgent, setWorkspaceAgent] = useState(null);
  const [isTownHallOpen, setIsTownHallOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const addMenuRef = useRef(null);
  const [catalogState, setCatalogState] = useState({
    isOpen: false,
    initialTab: 'all',
    position: null
  });

  const handleOpenCatalog = ({ initialTab = 'all', position = null } = {}) => {
    let mappedTab = initialTab;
    if (initialTab === 'tool') mappedTab = 'tools';
    else if (initialTab === 'trigger') mappedTab = 'triggers';
    else if (initialTab === 'agent') mappedTab = 'agents';
    setCatalogState({
      isOpen: true,
      initialTab: mappedTab,
      position
    });
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (addMenuRef.current && !addMenuRef.current.contains(event.target)) {
        setIsAddMenuOpen(false);
      }
    };
    if (isAddMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isAddMenuOpen]);

  const getCanvasCenterPos = () => {
    if (rfInstance) {
      const center = rfInstance.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
      });
      return {
        x: Math.round(center.x - 100 + (Math.random() * 40 - 20)),
        y: Math.round(center.y - 100 + (Math.random() * 40 - 20))
      };
    }
    return { x: 500, y: 300 };
  };
  const [goalTab, setGoalTab] = useState('editor'); // 'editor' | 'preview'
  const [showAddCronModal, setShowAddCronModal] = useState(false);
  const [newCronTask, setNewCronTask] = useState({
    title: '',
    frequency: 'Diário às 22:00',
    cron: '0 22 * * *',
    instruction: ''
  });

  // Diagnóstico e Verificação Real de Ferramentas
  const [isCheckingTools, setIsCheckingTools] = useState(false);
  const [testingToolId, setTestingToolId] = useState(null);
  const [testingTriggerId, setTestingTriggerId] = useState(null);
  const [triggerTestResult, setTriggerTestResult] = useState(null);
  const [toolDiagnosticResult, setToolDiagnosticResult] = useState(null);
  const [showContaAzulSecret, setShowContaAzulSecret] = useState(false);
  const [showPluggySecret, setShowPluggySecret] = useState(false);
  const [showMetaSecret, setShowMetaSecret] = useState(false);
  const [showGoogleSecret, setShowGoogleSecret] = useState(false);
  const [showMarqSecret, setShowMarqSecret] = useState(false);
  const [showMallSecret, setShowMallSecret] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  const [contaAzulOverview, setContaAzulOverview] = useState(null);
  const [loadingContaAzulOverview, setLoadingContaAzulOverview] = useState(false);
  const [showContaAzulCredentials, setShowContaAzulCredentials] = useState(false);
  const [driveFilesList, setDriveFilesList] = useState([]);
  const [loadingDriveFiles, setLoadingDriveFiles] = useState(false);
  const [driveSearchQuery, setDriveSearchQuery] = useState('');
  const [driveSearchNotFound, setDriveSearchNotFound] = useState(false);
  const driveResultsRef = useRef(null);
  const [departments, setDepartments] = useState(DEFAULT_DEPARTMENTS);

  // Carrega lista dinâmica de departamentos configurados
  useEffect(() => {
    fetch('/api/departments')
      .then(r => r.json())
      .then(d => {
        if (d.status === 'ok' && Array.isArray(d.departments) && d.departments.length > 0) {
          setDepartments(d.departments);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (driveFilesList.length > 0 && driveResultsRef.current) {
      driveResultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [driveFilesList]);

  const fetchDriveFilesList = async (query = '') => {
    setLoadingDriveFiles(true);
    setDriveSearchNotFound(false);
    try {
      const qParam = (typeof query === 'string' ? query : driveSearchQuery).trim();
      const url = `/api/tools/drive/files${qParam ? `?q=${encodeURIComponent(qParam)}` : ''}`;
      const res = await fetch(url, {
        headers: { 'X-User-Email': user?.email || '' }
      });
      if (!res.ok) throw new Error('Falha ao listar arquivos');
      const data = await res.json();
      const files = data.files || [];
      setDriveFilesList(files);
      setDriveSearchNotFound(files.length === 0);
    } catch (e) {
      console.error('Erro ao buscar arquivos do Google Drive:', e);
      alert('Não foi possível listar os arquivos do Google Drive: ' + e.message);
    } finally {
      setLoadingDriveFiles(false);
    }
  };

  useEffect(() => {
    if (selectedNode?.data?.type === 'contaazul') {
      setLoadingContaAzulOverview(true);
      fetch('/api/contaazul/overview')
        .then(res => res.json())
        .then(data => {
          setContaAzulOverview(data);
          setLoadingContaAzulOverview(false);
        })
        .catch(err => {
          console.error('Erro ao carregar overview do Conta Azul:', err);
          setLoadingContaAzulOverview(false);
        });
    } else if (selectedNode?.data?.type === 'meta_ads') {
      fetch('/api/tools/meta-ads/config')
        .then(res => res.json())
        .then(data => {
          if (data && data.ad_account_id) {
            setSelectedNode(prev => prev ? {
              ...prev,
              data: {
                ...prev.data,
                metaAccountId: prev.data.metaAccountId || data.ad_account_id,
                adAccountId: prev.data.adAccountId || data.ad_account_id,
                metaAppId: prev.data.metaAppId || data.app_id || '',
                metaPixelId: prev.data.metaPixelId || data.pixel_id || '',
                endpoint: prev.data.endpoint || data.endpoint || 'http://127.0.0.1:8998/sse'
              }
            } : prev);
          }
        })
        .catch(() => {});
    } else if (selectedNode?.data?.type === 'google_ads') {
      fetch('/api/tools/google-ads/config')
        .then(res => res.json())
        .then(data => {
          if (data && data.customer_id) {
            setSelectedNode(prev => prev ? {
              ...prev,
              data: {
                ...prev.data,
                googleCustomerId: prev.data.googleCustomerId || data.customer_id,
                customerId: prev.data.customerId || data.customer_id,
                googleClientId: prev.data.googleClientId || data.client_id || '',
                endpoint: prev.data.endpoint || data.endpoint || 'http://127.0.0.1:8997/sse'
              }
            } : prev);
          }
        })
        .catch(() => {});
    }
  }, [selectedNode?.id, selectedNode?.data?.type]);

  const testTriggerEvent = async (triggerNode) => {
    if (!triggerNode) return;
    const tType = triggerNode.data?.type;
    setTestingTriggerId(triggerNode.id);
    setTriggerTestResult(null);
    try {
      let endpoint = '';
      let payload = {};
      if (['ifood_event', 'ifood'].includes(tType)) {
        endpoint = '/api/webhooks/ifood';
        payload = {
          code: 'TEST_PING',
          orderId: 'TEST-123',
          customerName: 'Cliente Simulação',
          message: 'Validação de conectividade do gatilho iFood.'
        };
      } else if (['99food_event', '99food'].includes(tType)) {
        endpoint = '/api/webhooks/99food';
        payload = {
          event: 'TEST_PING',
          order_id: '99-TEST-456',
          customer_name: 'Cliente Teste 99',
          content: 'Validação de conectividade do gatilho 99 Food.'
        };
      } else if (['entrega_aki_event', 'entrega_aki'].includes(tType)) {
        endpoint = '/api/webhooks/entrega-aki';
        payload = {
          event: 'TEST_PING',
          order_id: 'AKI-TEST-789',
          customer_name: 'Cliente Entrega Aki',
          summary: 'Validação de conectividade do gatilho Entrega Aki.'
        };
      } else if (['chatwoot_event', 'chatwoot'].includes(tType)) {
        endpoint = '/api/webhooks/chatwoot';
        payload = {
          event: 'ping',
          message: 'Validação do webhook Chatwoot.'
        };
      } else if (tType === 'custom') {
        const key = triggerNode.data?.eventKey || triggerNode.data?.customKey || 'custom';
        endpoint = '/api/webhooks/custom/' + key + '/test';
        payload = {
          origem: 'AI Board Studio',
          mensagem: 'Disparo de teste do gatilho sob medida executado.'
        };
      }

      if (endpoint) {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        setTriggerTestResult({
          ok: res.ok,
          message: data.message || (res.ok ? 'Disparo recebido e validado com sucesso!' : 'Falha ao validar')
        });
      } else {
        setTriggerTestResult({ ok: true, message: 'Gatilho operacional e conectado ao Event Loop.' });
      }
    } catch (err) {
      setTriggerTestResult({ ok: false, message: 'Erro ao testar: ' + (err?.message || String(err)) });
    } finally {
      setTestingTriggerId(null);
      setTimeout(() => setTriggerTestResult(null), 5000);
    }
  };

  const copyToClipboard = (text, fieldName) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (e) {}
  };

  const getSharedConnectionFamily = useCallback((n) => {
    if (!n || (n.type !== 'tool' && n.type !== 'trigger')) return null;
    const rawType = String(n.data?.type || n.data?.toolType || '').toLowerCase();
    const nid = String(n.id || '').toLowerCase();
    if (rawType.includes('freescout') || nid.includes('freescout')) return 'freescout';
    if (rawType.includes('chatwoot') || rawType === 'chat' || nid.includes('chatwoot')) return 'chatwoot';
    if (rawType.includes('gmail') || nid.includes('gmail')) return 'gmail';
    if (rawType.includes('entrega') || nid.includes('entrega')) return 'entrega-aki';
    if (rawType.includes('ifood') || nid.includes('ifood')) return 'ifood';
    if (rawType.includes('99food') || nid.includes('99food')) return '99food';
    if (rawType === 'telegram' || nid === 'trig-telegram') return 'telegram';
    if (rawType === 'web' || nid === 'trig-web') return 'web';
    return null;
  }, []);

  const resolveHealthForNode = useCallback((n, healthMap) => {
    if (!n || !healthMap) return null;
    if (healthMap[n.id]) return healthMap[n.id];
    const fam = getSharedConnectionFamily(n);
    if (fam) {
      return (
        healthMap[`trig-${fam}-events`] ||
        healthMap[`trig-${fam}`] ||
        healthMap[`tool-${fam}`] ||
        null
      );
    }
    return healthMap[`tool-${n.data?.type}`] || healthMap[`trig-${n.data?.type}`] || null;
  }, [getSharedConnectionFamily]);

  const checkAllToolsHealth = useCallback(async () => {
    setIsCheckingTools(true);
    try {
      const res = await fetch('/api/tools/status');
      if (res.ok) {
        const healthMap = await res.json();
        const nowSec = Date.now() / 1000;
        try {
          localStorage.setItem('aiboard_tools_health_cache', JSON.stringify(healthMap));
          localStorage.setItem('aiboard_last_tool_check_ts', String(Date.now()));
        } catch (e) {}
        setNodes((nds) =>
          nds.map((n) => {
            if (n.type === 'tool' || n.type === 'trigger') {
              const h = resolveHealthForNode(n, healthMap);
              if (h) {
                const updatedData = {
                  ...n.data,
                  healthStatus: h.status,
                  healthLabel: h.status_label,
                  healthLatency: h.latency_ms,
                  healthDetails: h.details,
                  healthUpdatedAt: h.updated_at || nowSec,
                  isConfigured: h.is_configured
                };
                setSelectedNode((curr) => (curr && curr.id === n.id ? { ...curr, data: updatedData } : curr));
                return {
                  ...n,
                  data: updatedData
                };
              }
            }
            return n;
          })
        );
      }
    } catch (err) {
      console.error('Falha ao checar status das ferramentas e gatilhos:', err);
    } finally {
      setIsCheckingTools(false);
    }
  }, [resolveHealthForNode]);

  const testSingleTool = useCallback(async (node) => {
    if (!node) return;
    setTestingToolId(node.id);
    try {
      const fam = getSharedConnectionFamily(node);
      const sibling = fam ? nodes.find((n) => n.id !== node.id && getSharedConnectionFamily(n) === fam) : null;
      let payload = { ...(sibling?.data || {}), ...(node.data || {}) };
      if (fam === 'entrega-aki') {
        if (!payload.gestor_user) payload.gestor_user = sibling?.data?.gestor_user || '';
        if (!payload.gestor_password) payload.gestor_password = payload.gestor_pass || sibling?.data?.gestor_password || sibling?.data?.gestor_pass || '';
      }
      const res = await fetch(`/api/tools/${node.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const result = await res.json();
        const testedAt = result.updated_at || (Date.now() / 1000);
        result.updated_at = testedAt;
        setToolDiagnosticResult(result);

        // Atualiza cache local tanto para o bloco testado quanto para a família da conexão compartilhada
        try {
          const cachedStr = localStorage.getItem('aiboard_tools_health_cache') || '{}';
          const cachedMap = JSON.parse(cachedStr);
          cachedMap[node.id] = result;
          if (node.data?.type) {
            cachedMap[`tool-${node.data.type}`] = result;
            cachedMap[`trig-${node.data.type}`] = result;
          }
          if (fam) {
            cachedMap[`tool-${fam}`] = result;
            cachedMap[`trig-${fam}`] = result;
            cachedMap[`trig-${fam}-events`] = result;
          }
          localStorage.setItem('aiboard_tools_health_cache', JSON.stringify(cachedMap));
        } catch (e) {}

        setNodes((nds) =>
          nds.map((n) => {
            if (n.id === node.id || (fam && getSharedConnectionFamily(n) === fam)) {
              const updatedData = {
                ...n.data,
                healthStatus: result.status,
                healthLabel: result.status_label,
                healthLatency: result.latency_ms,
                healthDetails: result.details,
                healthUpdatedAt: testedAt,
                isConfigured: result.is_configured
              };
              setSelectedNode((curr) => (curr && curr.id === n.id ? { ...curr, data: updatedData } : curr));
              return { ...n, data: updatedData };
            }
            return n;
          })
        );
      }
    } catch (err) {
      const errAt = Date.now() / 1000;
      setToolDiagnosticResult({
        status: 'offline',
        status_label: 'Falha de Conexão',
        latency_ms: 0,
        details: String(err),
        updated_at: errAt
      });
    } finally {
      setTestingToolId(null);
    }
  }, [nodes, getSharedConnectionFamily]);

  // Mutex de Execução
  const [mutexStatus, setMutexStatus] = useState({ is_locked: false, current_task_id: null });
  const [liveTaskId, setLiveTaskId] = useState(null);

  // Pilha de Histórico para Undo / Redo
  const [history, setHistory] = useState(() => [{ nodes, edges }]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Injeta callbacks de ação nos nós de agentes para cliques diretos no card
  const handleNodeAction = useCallback((nodeId, actionType) => {
    const target = nodes.find((n) => n.id === nodeId);
    if (!target) return;
    if (actionType === 'config') setSelectedNode(target);
    else if (actionType === 'memory') setMemoryAgent(target);
    else if (actionType === 'personality') setPersonalityAgent(target);
    else if (actionType === 'workspace') setWorkspaceAgent(target);
  }, [nodes]);

  // Atualiza os nós com o callback de ação e preserva dimensões de redimensionamento
  const enrichedNodes = useMemo(() => {
    return nodes.map((n) => {
      const defaultWidth = n.type === 'agent' ? 280 : n.type === 'tool' ? 220 : 200;
      const sanitizedStyle = {
        ...(n.style || {}),
        width: n.style?.width || defaultWidth,
        height: n.style?.height || undefined
      };
      delete sanitizedStyle.maxWidth;
      delete sanitizedStyle.maxHeight;

      if (n.type === 'trigger' && sanitizedStyle.height && Number(sanitizedStyle.height) < 84) {
        delete sanitizedStyle.height;
      }

      if (n.type === 'agent') {
        // Calcula quantidade real de ferramentas conectadas a este agente
        const connectedTools = edges.filter(
          (e) => (e.target === n.id && e.source.startsWith('tool')) || (e.source === n.id && e.target.startsWith('tool'))
        ).length;

        return {
          ...n,
          style: sanitizedStyle,
          data: {
            ...n.data,
            toolsCount: connectedTools,
            onNodeAction: handleNodeAction
          }
        };
      }
      if (n.type === 'tool' || n.type === 'trigger') {
        let cachedHealth = {};
        if (!n.data.healthStatus) {
          try {
            const cachedStr = localStorage.getItem('aiboard_tools_health_cache');
            if (cachedStr) {
              const cachedMap = JSON.parse(cachedStr);
              const h = resolveHealthForNode(n, cachedMap);
              if (h) {
                cachedHealth = {
                  healthStatus: h.status,
                  healthLabel: h.status_label,
                  healthLatency: h.latency_ms,
                  healthDetails: h.details,
                  healthUpdatedAt: h.updated_at,
                  isConfigured: h.is_configured
                };
              }
            }
          } catch (e) {}
        }
        return {
          ...n,
          style: sanitizedStyle,
          data: {
            ...n.data,
            ...cachedHealth
          }
        };
      }
      return {
        ...n,
        style: sanitizedStyle
      };
    });
  }, [nodes, edges, handleNodeAction, resolveHealthForNode]);

  // Sanitiza e padroniza as arestas (conexões) para evitar dobras, nós torcidos e manter cores harmônicas
  const enrichedEdges = useMemo(() => {
    return edges.map((e) => {
      const sourceNode = nodes.find((n) => n.id === e.source);
      const targetNode = nodes.find((n) => n.id === e.target);

      const isSourceTool = sourceNode?.type === 'tool' || e.source?.startsWith('tool');
      const isTargetTool = targetNode?.type === 'tool' || e.target?.startsWith('tool');
      const isSourceTrigger = sourceNode?.type === 'trigger' || e.source?.startsWith('trig');

      // Se conecta Ferramenta e Agente
      if (isSourceTool || isTargetTool) {
        const toolNode = isSourceTool ? sourceNode : targetNode;
        const agentNode = isSourceTool ? targetNode : sourceNode;

        if (toolNode && agentNode) {
          const isToolOnRight = (toolNode.position?.x ?? 0) >= (agentNode.position?.x ?? 0);
          const correctSourceHandle = isToolOnRight ? 'tool_left_out' : 'tool_out';
          const correctTargetHandle = isToolOnRight ? 'tools_right' : 'tools';

          // Descobre a cor pelo departamento do agente conectado
          const dept = agentNode.data?.department || '';
          const agentId = agentNode.id || '';
          let strokeColor = '#7E5BB5';
          if (dept === 'cfo' || agentId.includes('cfo')) strokeColor = '#059669';
          else if (dept === 'coo' || agentId.includes('coo')) strokeColor = '#2563EB';
          else if (dept === 'cmo' || agentId.includes('cmo')) strokeColor = '#7C3AED';
          else if (dept === 'cpo' || agentId.includes('cpo')) strokeColor = '#E11D48';

          return {
            ...e,
            source: toolNode.id,
            target: agentNode.id,
            sourceHandle: correctSourceHandle,
            targetHandle: correctTargetHandle,
            type: 'bezier',
            style: { stroke: strokeColor, strokeWidth: 2.2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: strokeColor, width: 12, height: 12 }
          };
        }
      }

      // Se for gatilho (detecta automaticamente se o gatilho est? posicionado na lateral ou no topo do agente)
      if (isSourceTrigger) {
        let trigSourceHandle = e.sourceHandle || 'trigger_out';
        let trigTargetHandle = e.targetHandle || 'input';
        if (sourceNode && targetNode && targetNode.id !== 'agent-ceo') {
          const sW = Number(sourceNode?.measured?.width || sourceNode?.style?.width || sourceNode?.width || 220);
          const tW = Number(targetNode?.measured?.width || targetNode?.style?.width || targetNode?.width || 430);
          const sX = sourceNode.position?.x ?? 0;
          const tX = targetNode.position?.x ?? 0;
          if (sX + sW <= tX + 30) {
            trigSourceHandle = 'trigger_right_out';
            trigTargetHandle = 'tools';
          } else if (sX >= tX + tW - 30) {
            trigSourceHandle = 'trigger_left_out';
            trigTargetHandle = 'tools_right';
          }
        }
        return {
          ...e,
          type: 'bezier',
          sourceHandle: trigSourceHandle,
          targetHandle: trigTargetHandle,
          style: { stroke: '#CA3D26', strokeWidth: 2.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#CA3D26', width: 14, height: 14 }
        };
      }

      // Conexão Agente -> Agente (Garante alinhamento vertical top/bottom e tipo padronizado)
      return {
        ...e,
        type: 'bezier',
        sourceHandle: e.sourceHandle || 'output',
        targetHandle: e.targetHandle || 'input'
      };
    });
  }, [edges, nodes]);

    const [topologyReady, setTopologyReady] = useState(false);
  const [isCanvasVisible, setIsCanvasVisible] = useState(false);
  const initialFitDoneRef = useRef(false);

  // Carrega Topologia oficial do backend SQLite e persiste em cache local
  useEffect(() => {
    fetch('/api/canvas/topology')
      .then((r) => r.json())
      .then((data) => {
        if (data.nodes && data.nodes.length > 0) {
          let incomingNodes = [...data.nodes];
          let incomingEdges = [...(data.edges || [])];

          const normalizedNodes = incomingNodes.map((n) => {
            const nextStyle = { ...(n.style || {}) };
            delete nextStyle.maxWidth;
            delete nextStyle.maxHeight;
            if (n.type === 'trigger' && nextStyle.height && Number(nextStyle.height) < 84) {
              delete nextStyle.height;
            }
            return {
              ...n,
              selected: false,
              style: {
                ...nextStyle,
                width: nextStyle.width || (n.type === 'agent' ? 280 : n.type === 'tool' ? 220 : 200)
              }
            };
          });
          const normalizedEdges = (incomingEdges || []).map((e) => ({ ...e, selected: false }));
          setNodes(normalizedNodes);
          setEdges(normalizedEdges);
          setHistory([{ nodes: normalizedNodes, edges: normalizedEdges }]);
          setHistoryIndex(0);

          try {
            const cachePayload = JSON.stringify({ nodes: normalizedNodes, edges: normalizedEdges });
            localStorage.setItem('aiboard_canvas_topology_cache', cachePayload);
            localStorage.setItem('aiboard_flow_nodes_v2', JSON.stringify(normalizedNodes));
            localStorage.setItem('aiboard_flow_edges_v2', JSON.stringify(normalizedEdges));
          } catch (e) {}
        } else {
          // Apenas em banco 100% virgem usa o organograma template
          setNodes(initialNodes);
          setEdges(initialEdges);
          setHistory([{ nodes: initialNodes, edges: initialEdges }]);
          setHistoryIndex(0);
          try {
            const cachePayload = JSON.stringify({ nodes: initialNodes, edges: initialEdges });
            localStorage.setItem('aiboard_canvas_topology_cache', cachePayload);
          } catch (e) {}
        }
        setTopologyReady(true);
      })
      .catch((err) => {
        console.log('Topologia local mantida:', err);
        setTopologyReady(true);
      });
  }, []);

  // Centraliza e enquadra perfeitamente todos os blocos assim que a topologia e o ReactFlow estiverem prontos
  useEffect(() => {
    if (rfInstance && topologyReady && !initialFitDoneRef.current) {
      initialFitDoneRef.current = true;
      const timer = setTimeout(() => {
        try {
          rfInstance.fitView({ padding: 0.12, duration: 250 });
        } catch (e) {}
        setTimeout(() => {
          setIsCanvasVisible(true);
        }, 120);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [rfInstance, topologyReady]);

  // Fallback de segurança para garantir que a tela de carregamento nunca trave
  useEffect(() => {
    if (topologyReady && !isCanvasVisible) {
      const fallbackTimer = setTimeout(() => {
        setIsCanvasVisible(true);
      }, 1200);
      return () => clearTimeout(fallbackTimer);
    }
  }, [topologyReady, isCanvasVisible]);

  // Diagnóstico periódico das ferramentas a cada 5 horas (ou execução sob demanda no botão)
  useEffect(() => {
    const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;

    const applyHealthMap = (healthMap) => {
      if (!healthMap || Object.keys(healthMap).length === 0) return 0;
      let maxTs = 0;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.type === 'tool' || n.type === 'trigger') {
            const h = resolveHealthForNode(n, healthMap);
            if (h) {
              const uTs = (h.updated_at || 0) * 1000;
              if (uTs > maxTs) maxTs = uTs;
              const updatedData = {
                ...n.data,
                healthStatus: h.status,
                healthLabel: h.status_label,
                healthLatency: h.latency_ms,
                healthDetails: h.details,
                healthUpdatedAt: h.updated_at,
                isConfigured: h.is_configured
              };
              setSelectedNode((curr) => (curr && curr.id === n.id ? { ...curr, data: updatedData } : curr));
              return {
                ...n,
                data: updatedData
              };
            }
          }
          return n;
        })
      );
      return maxTs;
    };

    // 1. Renderiza imediatamente a partir do cache local se existir
    let clientTs = 0;
    try {
      const cached = localStorage.getItem('aiboard_tools_health_cache');
      if (cached) {
        clientTs = applyHealthMap(JSON.parse(cached));
      }
    } catch (e) {}

    // 2. Consulta o cache central persistido do servidor para sincronizar múltiplos dispositivos (Desktop vs Celular)
    fetch('/api/tools/cache')
      .then((r) => r.ok ? r.json() : null)
      .then((serverMap) => {
        if (serverMap && Object.keys(serverMap).length > 0) {
          const serverMaxTs = applyHealthMap(serverMap);
          try {
            localStorage.setItem('aiboard_tools_health_cache', JSON.stringify(serverMap));
            if (serverMaxTs > 0) {
              localStorage.setItem('aiboard_last_tool_check_ts', serverMaxTs.toString());
            }
          } catch (e) {}

          const effectiveTs = Math.max(serverMaxTs, clientTs);
          const now = Date.now();
          // Executa teste APENAS se o cache do servidor/cliente estiver vazio ou com mais de 5 horas
          if (!effectiveTs || (now - effectiveTs) > FIVE_HOURS_MS) {
            checkAllToolsHealth();
          }
        } else {
          const lastCheck = localStorage.getItem('aiboard_last_tool_check_ts');
          const now = Date.now();
          if (!lastCheck || (now - Number(lastCheck)) > FIVE_HOURS_MS) {
            checkAllToolsHealth();
          }
        }
      })
      .catch(() => {
        const lastCheck = localStorage.getItem('aiboard_last_tool_check_ts');
        const now = Date.now();
        if (!lastCheck || (now - Number(lastCheck)) > FIVE_HOURS_MS) {
          checkAllToolsHealth();
        }
      });

    // Timer periódico de 5 horas
    const timer = setInterval(() => {
      checkAllToolsHealth();
    }, FIVE_HOURS_MS);

    return () => clearInterval(timer);
  }, [checkAllToolsHealth]);

  // Monitora Mutex de Execução a cada 5 segundos
  useEffect(() => {
    const checkMutex = () => {
      fetch('/api/canvas/mutex')
        .then((r) => r.json())
        .then((data) => setMutexStatus(data))
        .catch(() => {});
    };
    checkMutex();
    const interval = setInterval(checkMutex, 5000);
    return () => clearInterval(interval);
  }, []);

  const pushHistory = useCallback((newNodes, newEdges) => {
    setHistory((prev) => {
      const sliced = prev.slice(0, historyIndex + 1);
      return [...sliced, { nodes: newNodes, edges: newEdges }];
    });
    setHistoryIndex((prev) => prev + 1);
    setHasUnsavedChanges(true);
  }, [historyIndex]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const target = history[historyIndex - 1];
      setNodes(target.nodes);
      setEdges(target.edges);
      setHistoryIndex((prev) => prev - 1);
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const target = history[historyIndex + 1];
      setNodes(target.nodes);
      setEdges(target.edges);
      setHistoryIndex((prev) => prev + 1);
    }
  }, [history, historyIndex]);

  // Otimização Automática de Modelos por Custo (Frugal AI)
  const optimizeModelsByCost = useCallback(() => {
    let countTier1 = 0; // Flash-Lite 3.1 ($0.25/M)
    let countTier2 = 0; // Flash-Lite 3.5 ($0.30/M)
    let countTier3 = 0; // Flash 3.8 ($0.75/M)

    const updatedNodes = nodes.map((node) => {
      if (node.type !== 'agent') return node;

      const id = (node.id || '').toLowerCase();
      const role = (node.data?.role || '').toLowerCase();
      const goal = (node.data?.goal || '').toLowerCase();

      let targetModel = 'Gemini 3.8 Flash';

      // 1. Tier 1: Frugal / Ultra Econômico ($0.25 / 1M) - Busca no Drive, POPs, Estoque, SAC
      if (
        id.includes('stock') ||
        id.includes('manuals') ||
        id.includes('sac') ||
        id.includes('training') ||
        role.includes('estoque') ||
        role.includes('sac') ||
        role.includes('fichas') ||
        role.includes('treinamento') ||
        goal.includes('chatwoot') ||
        goal.includes('procedimentos') ||
        goal.includes('fichas técnicas')
      ) {
        targetModel = 'Gemini 3.1 Flash-Lite';
        countTier1++;
      }
      // 2. Tier 2: Econômico Rápido ($0.30 / 1M) - Auditoria semi-estruturada, DP, Anúncios Ads
      else if (
        id.includes('payable') ||
        id.includes('dp') ||
        id.includes('ads') ||
        role.includes('contas a pagar') ||
        role.includes('departamento pessoal') ||
        role.includes('tráfego') ||
        role.includes('ads')
      ) {
        targetModel = 'Gemini 3.5 Flash-Lite';
        countTier2++;
      }
      // 3. Tier 3: Equilíbrio e Coordenação ($0.75 / 1M) - C-Level, DRE, Copywriter Criativo
      else {
        targetModel = 'Gemini 3.8 Flash';
        countTier3++;
      }

      return {
        ...node,
        data: {
          ...node.data,
          model: targetModel
        }
      };
    });

    setNodes(updatedNodes);
    pushHistory(updatedNodes, edges);

    try {
      localStorage.setItem('aiboard_flow_nodes_v2', JSON.stringify(updatedNodes));
    } catch (e) {}

    // Salva automaticamente a nova topologia se for admin
    if (isAdmin) {
      fetch('/api/canvas/topology', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify({ nodes: updatedNodes, edges })
      }).catch(() => {});
    }

    setOptimizationModal({
      total: countTier1 + countTier2 + countTier3,
      tier1: countTier1,
      tier2: countTier2,
      tier3: countTier3,
      avgSavings: '64%'
    });
  }, [nodes, edges, isAdmin, user, pushHistory]);

  const handleDeleteNode = useCallback(
    (nodeToDelete) => {
      if (!nodeToDelete) return;
      const id = nodeToDelete.id || nodeToDelete;
      setNodes((nds) => {
        const nextNodes = nds.filter((n) => n.id !== id);
        setEdges((eds) => {
          const nextEdges = eds.filter((e) => e.source !== id && e.target !== id);
          pushHistory(nextNodes, nextEdges);
          return nextEdges;
        });
        return nextNodes;
      });
      setHasUnsavedChanges(true);
      if (selectedNode?.id === id) setSelectedNode(null);
      if (memoryAgent?.id === id) setMemoryAgent(null);
      if (personalityAgent?.id === id) setPersonalityAgent(null);
      if (workspaceAgent?.id === id) setWorkspaceAgent(null);
      setContextMenu(null);
    },
    [selectedNode, memoryAgent, personalityAgent, workspaceAgent, pushHistory]
  );

  const handleDeleteEdge = useCallback(
    (edgeToDelete) => {
      if (!edgeToDelete) return;
      const id = edgeToDelete.id || edgeToDelete;
      setEdges((eds) => {
        const nextEdges = eds.filter((e) => e.id !== id);
        pushHistory(nodes, nextEdges);
        return nextEdges;
      });
      setHasUnsavedChanges(true);
      setContextMenu(null);
    },
    [nodes, pushHistory]
  );

  // Atalhos Globais: Ctrl+Z (Undo), Ctrl+Y (Redo), Ctrl+C / Ctrl+V (Copiar e Colar), Delete / Backspace (Remover Bloco ou Conexão)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const targetNode = selectedNode || nodes.find((n) => n.selected);
        if (targetNode) {
          clipboardNodeRef.current = JSON.parse(JSON.stringify(targetNode));
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (clipboardNodeRef.current && isAdmin) {
          e.preventDefault();
          const nodeToPaste = clipboardNodeRef.current;
          let pastePos = { x: nodeToPaste.position.x + 35, y: nodeToPaste.position.y + 35 };

          if (mouseScreenPosRef.current && rfInstance) {
            try {
              const flowPos = rfInstance.screenToFlowPosition(mouseScreenPosRef.current);
              if (flowPos && typeof flowPos.x === 'number' && typeof flowPos.y === 'number') {
                pastePos = flowPos;
              }
            } catch (err) {}
          }

          const newId = `${nodeToPaste.type}-${Date.now()}`;
          const newNode = {
            ...nodeToPaste,
            id: newId,
            position: pastePos,
            data: {
              ...nodeToPaste.data,
              role: nodeToPaste.data?.role ? `${nodeToPaste.data.role} (Cópia)` : undefined,
              name: nodeToPaste.data?.name ? `${nodeToPaste.data.name} (Cópia)` : undefined
            },
            selected: true
          };

          setNodes((nds) => {
            const nextNodes = nds.map((n) => ({ ...n, selected: false })).concat(newNode);
            pushHistory(nextNodes, edges);
            return nextNodes;
          });
          setSelectedNode(newNode);
          setHasUnsavedChanges(true);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const selected = nodes.find((n) => n.selected);
        if (selected) {
          e.preventDefault();
          handleDeleteNode(selected);
        } else {
          const selectedEdge = edges.find((ed) => ed.selected);
          if (selectedEdge) {
            e.preventDefault();
            handleDeleteEdge(selectedEdge);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, nodes, edges, selectedNode, rfInstance, isAdmin, handleDeleteNode, handleDeleteEdge, pushHistory]);

  const onNodesChange = useCallback(
    (changes) => {
      setNodes((nds) => {
        const nextNodes = applyNodeChanges(changes, nds);
        let hasDim = false;
        const resizedIds = [];
        changes.forEach((c) => {
          if (c.type === 'dimensions' && c.dimensions && c.resizing) {
            hasDim = true;
            resizedIds.push(c.id);
            const target = nextNodes.find((n) => n.id === c.id);
            if (target) {
              target.style = {
                ...(target.style || {}),
                width: c.dimensions.width,
                height: c.dimensions.height
              };
              target.width = c.dimensions.width;
              target.height = c.dimensions.height;
              target.measured = {
                width: c.dimensions.width,
                height: c.dimensions.height
              };
            }
          }
        });
        if (hasDim || changes.some((c) => c.type === 'remove')) {
          setHasUnsavedChanges(true);
        }
        if (changes.some((c) => c.type === 'remove')) {
          pushHistory(nextNodes, edges);
        }
        return nextNodes;
      });
    },
    [edges, pushHistory]
  );
  const onEdgesChange = useCallback(
    (changes) => {
      setEdges((eds) => {
        const nextEdges = applyEdgeChanges(changes, eds);
        if (changes.some((c) => c.type === 'remove')) {
          setHasUnsavedChanges(true);
          pushHistory(nodes, nextEdges);
        }
        return nextEdges;
      });
    },
    [nodes, pushHistory]
  );

  const onNodeDragStop = useCallback(() => {
    pushHistory(nodes, edges);
  }, [nodes, edges, pushHistory]);

  const onConnect = useCallback(
    (connection) => {
      setEdges((eds) => {
        let conn = { ...connection };
        const sourceNode = nodes.find((n) => n.id === conn.source);
        const targetNode = nodes.find((n) => n.id === conn.target);

        const isSourceTool = sourceNode?.type === 'tool' || conn.source?.startsWith('tool');
        const isTargetTool = targetNode?.type === 'tool' || conn.target?.startsWith('tool');
        const isSourceTrigger = sourceNode?.type === 'trigger' || conn.source?.startsWith('trig');

        // Se conectando Ferramenta <-> Agente, corrige automaticamente os lados para evitar dobras e nós
        if (isSourceTool || isTargetTool) {
          const toolNode = isSourceTool ? sourceNode : targetNode;
          const agentNode = isSourceTool ? targetNode : sourceNode;

          if (toolNode && agentNode) {
            conn.source = toolNode.id;
            conn.target = agentNode.id;

            const isToolOnRight = (toolNode.position?.x ?? 0) >= (agentNode.position?.x ?? 0);
            if (isToolOnRight) {
              conn.sourceHandle = 'tool_left_out'; // Sai pelo lado esquerdo da ferramenta
              conn.targetHandle = 'tools_right';    // Entra pelo lado direito do agente
            } else {
              conn.sourceHandle = 'tool_out';      // Sai pelo lado direito da ferramenta
              conn.targetHandle = 'tools';          // Entra pelo lado esquerdo do agente
            }
          }
        }

        // Determina cor de acordo com o departamento do agente
        const connectedAgent = (targetNode?.type === 'agent' ? targetNode : sourceNode?.type === 'agent' ? sourceNode : null);
        const dept = connectedAgent?.data?.department || '';
        const agentId = connectedAgent?.id || '';

        let strokeColor = '#16422B'; // Padrão Verde Escuro AI Board
        let strokeWidth = 2.2;
        let animated = false;

        if (isSourceTrigger) {
          strokeColor = '#CA3D26';
          strokeWidth = 2.5;
          animated = true;
        } else if (dept === 'cfo' || agentId.includes('cfo')) {
          strokeColor = '#059669'; // Verde CFO
        } else if (dept === 'coo' || agentId.includes('coo')) {
          strokeColor = '#2563EB'; // Azul COO
        } else if (dept === 'cmo' || agentId.includes('cmo')) {
          strokeColor = '#7C3AED'; // Roxo CMO
        } else if (dept === 'cpo' || agentId.includes('cpo')) {
          strokeColor = '#E11D48'; // Rosa CPO
        } else if (isSourceTool || isTargetTool) {
          strokeColor = '#7E5BB5';
        }

        // Remove conexão duplicada anterior entre os mesmos nós
        const filteredEds = eds.filter(
          (e) => !(e.source === conn.source && e.target === conn.target)
        );

        const nextEdges = addEdge(
          {
            ...conn,
            type: 'bezier',
            animated,
            style: { stroke: strokeColor, strokeWidth },
            markerEnd: { type: MarkerType.ArrowClosed, color: strokeColor, width: 12, height: 12 }
          },
          filteredEds
        );
        pushHistory(nodes, nextEdges);
        return nextEdges;
      });
    },
    [nodes, pushHistory]
  );

  const onNodeClick = useCallback((_, node) => {
    setToolDiagnosticResult(null);
    setSelectedNode(node);
  }, []);

  // Menu de Contexto (Botão Direito em Nós)
  const onNodeContextMenu = useCallback((e, node) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      targetNode: node,
      targetEdge: null
    });
  }, []);

  // Menu de Contexto (Botão Direito em Conexões / Arestas)
  const onEdgeContextMenu = useCallback((e, edge) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      targetNode: null,
      targetEdge: edge
    });
  }, []);

  // Duplo Clique na Conexão para Desfazer / Excluir Rapidamente
  const onEdgeDoubleClick = useCallback((e, edge) => {
    e.preventDefault();
    handleDeleteEdge(edge);
  }, [handleDeleteEdge]);

  const onPaneContextMenu = useCallback((e) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      targetNode: null,
      targetEdge: null
    });
  }, []);

  const handleDuplicateNode = useCallback(
    (nodeToDup) => {
      if (!nodeToDup) return;
      const newId = `${nodeToDup.type}-${Date.now()}`;
      const newNode = {
        ...nodeToDup,
        id: newId,
        position: {
          x: nodeToDup.position.x + 40,
          y: nodeToDup.position.y + 40
        },
        data: {
          ...nodeToDup.data,
          role: nodeToDup.data.role ? `${nodeToDup.data.role} (Cópia)` : undefined,
          name: nodeToDup.data.name ? `${nodeToDup.data.name} (Cópia)` : undefined
        },
        selected: false
      };
      setNodes((nds) => {
        const nextNodes = [...nds, newNode];
        pushHistory(nextNodes, edges);
        return nextNodes;
      });
    },
    [edges, pushHistory]
  );

  const handleSave = async (nodesToSave = nodes, edgesToSave = edges) => {
    if (!isAdmin) return;
    const cleanNodes = (nodesToSave || []).map((n) => {
      const nextStyle = { ...(n.style || {}) };
      delete nextStyle.maxWidth;
      delete nextStyle.maxHeight;
      return { ...n, selected: false, style: nextStyle };
    });
    const cleanEdges = (edgesToSave || []).map((e) => ({ ...e, selected: false }));
    localStorage.setItem('aiboard_flow_nodes_v2', JSON.stringify(cleanNodes));
    localStorage.setItem('aiboard_flow_edges_v2', JSON.stringify(cleanEdges));
    localStorage.setItem('aiboard_canvas_topology_cache', JSON.stringify({ nodes: cleanNodes, edges: cleanEdges }));
    localStorage.setItem('aiboard_flow_edges_v2', JSON.stringify(cleanEdges));
    try {
      const res = await fetch('/api/canvas/topology', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify({ nodes: cleanNodes, edges: cleanEdges })
      });
      if (!res.ok) {
        const err = await res.json();
        alert('Erro ao salvar no servidor: ' + (err.detail || 'Falha'));
        return;
      }
    } catch (err) {
      console.error('Erro ao sincronizar topologia no backend:', err);
    }
    setHasUnsavedChanges(false);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
  };

  const handleAutoOrganize = useCallback(async () => {
    // Motor ELK (Eclipse Layout Kernel ? Sugiyama + Brandes-K?pf) + Empacotamento por Contorno de Clusters Compostos
    if (!nodes || nodes.length === 0) return;
    try {
      const { nodes: layoutedNodes, edges: layoutedEdges } = await computeElkCompoundLayout(nodes, edges);
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      pushHistory(layoutedNodes, layoutedEdges);
      setHasUnsavedChanges(true);

      if (rfInstance) {
        setTimeout(() => {
          rfInstance.fitView({ padding: 0.12, duration: 350 });
        }, 60);
      }
    } catch (err) {
      console.error('Erro no motor ELK de auto-organiza??o:', err);
    }
  }, [nodes, edges, rfInstance, pushHistory]);

  const addCustomAgent = (pos, isLead = false, initialData = {}) => {
    let canvasPos = pos;
    // Se a posição for vinda do ContextMenu em coordenadas de tela (clientX/clientY), converte com screenToFlowPosition
    if (pos && typeof pos.x === 'number' && typeof pos.y === 'number' && rfInstance) {
      if (pos.isScreen) {
        canvasPos = rfInstance.screenToFlowPosition({ x: pos.x, y: pos.y });
      }
    }
    const newId = `agent-${Date.now()}`;
    const newNode = {
      id: newId,
      type: 'agent',
      position: canvasPos || { x: 520, y: 350 },
      data: {
        role: initialData.role || (isLead ? 'Coordenador Geral' : 'Novo Especialista'),
        name: initialData.name || (isLead ? 'Central Executiva Líder' : 'Agente Personalizado'),
        goal: initialData.desc || (isLead
          ? 'Interpretar a solicitação do usuário, coordenar investigações com os especialistas e entregar um resumo executivo com números exatos, claro e acionável.'
          : 'Descreva detalhadamente o objetivo deste agente na operação AI Board.'),
        model: initialData.model || 'Gemini 3.8 Flash',
        department: initialData.department || '',
        isLead: isLead,
        toolsCount: 0,
        scheduledTasks: []
      }
    };
    setNodes((nds) => {
      const nextNodes = [...nds, newNode];
      pushHistory(nextNodes, edges);
      return nextNodes;
    });
  };

  const addToolPreset = (preset, pos) => {
    let canvasPos = pos;
    if (pos && typeof pos.x === 'number' && typeof pos.y === 'number' && rfInstance) {
      if (pos.isScreen) {
        canvasPos = rfInstance.screenToFlowPosition({ x: pos.x, y: pos.y });
      }
    }
    const newId = `tool-${preset.id}-${Date.now()}`;
    const newNode = {
      id: newId,
      type: 'tool',
      position: canvasPos || { x: 80, y: 500 },
      data: {
        name: preset.name,
        category: preset.category,
        type: preset.id,
        isMcp: preset.id === 'generic_mcp',
        endpoint: preset.id === 'generic_mcp' ? 'http://127.0.0.1:8999/sse' : '',
        side: canvasPos && canvasPos.x > 500 ? 'right' : 'left'
      }
    };
    setNodes((nds) => {
      const nextNodes = [...nds, newNode];
      pushHistory(nextNodes, edges);
      return nextNodes;
    });
  };

  const addTriggerPreset = (preset, pos) => {
    let canvasPos = pos;
    if (pos && typeof pos.x === 'number' && typeof pos.y === 'number' && rfInstance) {
      if (pos.isScreen) {
        canvasPos = rfInstance.screenToFlowPosition({ x: pos.x, y: pos.y });
      }
    }
    const newId = `trigger-${preset.id || 'custom'}-${Date.now()}`;
    const newNode = {
      id: newId,
      type: 'trigger',
      position: canvasPos || { x: 480, y: 50 },
      data: {
        label: preset.name,
        subtitle: preset.category,
        type: preset.type || 'webhook',
        endpoint: preset.type === 'webhook' ? '/api/webhook/trigger' : '',
        cron: preset.type === 'cron' ? '0 9 * * 1-5' : ''
      }
    };
    setNodes((nds) => {
      const nextNodes = [...nds, newNode];
      pushHistory(nextNodes, edges);
      return nextNodes;
    });
  };

  const SHARED_CONNECTION_FIELDS = [
    'freescoutAccessMode',
    'freescoutUrl',
    'freescoutApiKey',
    'chatwootUrl',
    'chatwootInboxId',
    'gmailAccount',
    'gmailScope',
    'gestor_url',
    'gestor_cnpj',
    'gestor_user',
    'gestor_password',
    'gestor_pass',
    'gestor_canal',
    'night_window_start',
    'night_window_end',
    'erp_delivery_class',
    'vitrine_url',
    'ifood_client_id',
    'ifood_client_secret',
    'ifood_merchant_id',
    'ifood_poll_interval',
    'ninety_nine_portal_url',
    'ninety_nine_user',
    'ninety_nine_password',
    'ninety_nine_store_id'
  ];

  const updateSelectedNode = (field, val) => {
    if (!selectedNode) return;
    const fam = SHARED_CONNECTION_FIELDS.includes(field) ? getSharedConnectionFamily(selectedNode) : null;
    setNodes((nds) => {
      const nextNodes = nds.map((n) => {
        if (n.id === selectedNode.id || (fam && getSharedConnectionFamily(n) === fam)) {
          const extra = {};
          if (field === 'gestor_pass') extra.gestor_password = val;
          if (field === 'gestor_password') extra.gestor_pass = val;
          return {
            ...n,
            data: {
              ...n.data,
              [field]: val,
              ...extra
            }
          };
        }
        return n;
      });
      return nextNodes;
    });
    setSelectedNode((prev) => ({
      ...prev,
      data: {
        ...prev.data,
        [field]: val,
        ...(field === 'gestor_pass' ? { gestor_password: val } : {}),
        ...(field === 'gestor_password' ? { gestor_pass: val } : {})
      }
    }));
    setHasUnsavedChanges(true);
  };

  return (
    <div className="relative w-full h-full bg-[#F8FAF9] select-none">
      {/* Barra de Ferramentas Superior Responsiva */}
      <div className="absolute top-2 left-2 right-2 md:top-4 md:left-4 md:right-4 z-10 flex flex-col md:flex-row md:items-center justify-between gap-2 pointer-events-none">
        {/* Status e Título */}
        <div className="bg-white/95 backdrop-blur-md border border-[#E2E8E4] px-3 py-1.5 md:px-4 md:py-2 rounded-2xl shadow-sm pointer-events-auto flex items-center justify-between gap-2.5 w-full md:w-auto min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></div>
            <span className="font-extrabold text-xs text-[#16422B] uppercase tracking-wider truncate whitespace-nowrap">
              <span className="hidden md:inline">{t('studio.title')}</span>
              <span className="md:hidden">{t('studio.titleMobile')}</span>
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Badge do Mutex de Execução */}
            <div className="shrink-0 flex items-center">
              {mutexStatus.is_locked ? (
                <button
                  type="button"
                  onClick={() => setLiveTaskId(mutexStatus.current_task_id)}
                  className="text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition shadow-2xs whitespace-nowrap"
                  title={t('studio.runningTaskTooltip')}
                >
                  <Lock className="w-3 h-3 text-amber-600 animate-bounce shrink-0" />
                  <span className="hidden sm:inline">{t('studio.runningTask')} #{mutexStatus.current_task_id}</span>
                  <span className="sm:hidden">#{mutexStatus.current_task_id}</span>
                  <Terminal className="w-3 h-3 text-amber-600 ml-0.5 shrink-0" />
                </button>
              ) : (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs whitespace-nowrap">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{t('studio.ready')}</span>
                </span>
              )}
            </div>

            {/* No celular, botão de Salvar direto no topo */}
            {isAdmin && (
              <button
                onClick={() => handleSave()}
                className={`md:hidden flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-xl shadow-xs transition shrink-0 whitespace-nowrap ${
                  hasUnsavedChanges
                    ? 'bg-[#16422B] hover:bg-[#123522] text-white ring-2 ring-amber-400 ring-offset-1 animate-pulse'
                    : 'bg-[#16422B] hover:bg-[#2B6143] text-white'
                }`}
              >
                <Save className="w-3.5 h-3.5 shrink-0" />
                <span>{hasUnsavedChanges ? `${t('studio.save')} *` : t('studio.save')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Botões de Ação na Toolbar */}
        <div
          className="bg-white/95 backdrop-blur-md border border-[#E2E8E4] p-1 md:p-1.5 rounded-2xl shadow-md pointer-events-auto flex items-center gap-1 md:gap-1.5 w-full md:w-auto overflow-visible flex-nowrap"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {/* Desfazer e Refazer */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={handleUndo}
              disabled={historyIndex === 0}
              title={t('studio.undo')}
              className="p-1.5 rounded-xl text-[#5A6B61] hover:text-[#16422B] hover:bg-[#EFF5F1] disabled:opacity-30 disabled:hover:bg-transparent transition shrink-0"
            >
              <Undo2 className="w-4 h-4" />
            </button>

            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              title={t('studio.redo')}
              className="p-1.5 rounded-xl text-[#5A6B61] hover:text-[#16422B] hover:bg-[#EFF5F1] disabled:opacity-30 disabled:hover:bg-transparent transition shrink-0"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          <div className="w-px h-5 bg-[#E2E8E4] mx-0.5 shrink-0"></div>

          {/* Botão Town Hall Global */}
          <button
            onClick={() => setIsTownHallOpen(true)}
            className="flex items-center justify-center p-2 rounded-xl text-[#16422B] bg-[#EFF5F1] hover:bg-[#E2E8E4] transition shadow-2xs shrink-0 cursor-pointer"
            title={t('studio.townHallTooltip')}
          >
            <Building2 className="w-4 h-4 text-[#16422B] shrink-0" />
          </button>

          {/* Botão Histórico & Diffs */}
          <button
            onClick={() => setIsHistoryModalOpen(true)}
            className="flex items-center justify-center p-2 rounded-xl text-emerald-800 bg-[#EFF5F1] hover:bg-[#E2E8E4] transition shadow-2xs shrink-0 cursor-pointer"
            title={t('studio.historyTooltip')}
          >
            <HistoryIcon className="w-4 h-4 text-emerald-700 shrink-0" />
          </button>

          {isAdmin ? (
            <>
              {/* Botão Unificado: + (Adicionar Agente, Gatilho ou Ferramenta) */}
              <div className="relative shrink-0" ref={addMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsAddMenuOpen((prev) => !prev)}
                  className={`p-2 rounded-xl transition shadow-2xs shrink-0 cursor-pointer flex items-center justify-center ${
                    isAddMenuOpen
                      ? 'bg-[#16422B] text-white'
                      : 'bg-[#EFF5F1] hover:bg-[#E2E8E4] text-[#16422B]'
                  }`}
                  title={t('studio.addMenuTooltip')}
                >
                  <Plus className={`w-4 h-4 transition-transform duration-200 ${isAddMenuOpen ? 'rotate-45' : ''}`} />
                </button>

                {isAddMenuOpen && (
                  <div className="absolute top-full right-0 mt-2 w-72 bg-white/95 backdrop-blur-md border border-[#E2E8E4] rounded-2xl shadow-xl p-2 z-50 flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-2">
                    <div className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[#5A6B61] border-b border-[#E2E8E4]">
                      {t('studio.addMenuTitle')}
                    </div>

                    {/* Novo Agente */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddMenuOpen(false);
                        addCustomAgent(getCanvasCenterPos(), false);
                      }}
                      className="flex items-center gap-2.5 p-2 rounded-xl text-left hover:bg-[#EFF5F1] transition group cursor-pointer"
                    >
                      <div className="p-2 rounded-lg bg-emerald-50 text-[#16422B] group-hover:bg-[#16422B] group-hover:text-white transition shrink-0">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[#16422B] leading-tight truncate">{t('studio.newAgent')}</div>
                        <div className="text-[10px] text-[#5A6B61] leading-tight mt-0.5 truncate">{t('studio.newAgentDesc')}</div>
                      </div>
                    </button>

                    {/* Gatilhos Reativos */}
                    <div className="pt-1 border-t border-[#E2E8E4]">
                      <div className="px-2 py-1 text-[10px] font-bold text-[#5A6B61] flex items-center gap-1">
                        <Zap className="w-3 h-3 text-[#CA3D26] shrink-0" />
                        <span className="truncate">{t('studio.reactiveTriggers')}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 mt-0.5">
                        {getFilteredTriggerPresets().filter(p => ['event_loop_chatwoot', 'telegram', 'webhook', 'cron'].includes(p.id)).map((preset) => {
                          const IconComp = preset.icon;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => {
                                setIsAddMenuOpen(false);
                                addTriggerPreset(preset, getCanvasCenterPos());
                              }}
                              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left hover:bg-[#EFF5F1] transition cursor-pointer text-xs font-semibold text-[#16422B] min-w-0"
                              title={tr(preset.category)}
                            >
                              <IconComp className={`w-3.5 h-3.5 shrink-0 ${preset.color}`} />
                              <span className="truncate text-[11px]">{tr(preset.name)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Ferramentas & MCP */}
                    <div className="pt-1 border-t border-[#E2E8E4]">
                      <div className="px-2 py-1 text-[10px] font-bold text-[#5A6B61] flex items-center gap-1">
                        <Wrench className="w-3 h-3 text-indigo-600 shrink-0" />
                        <span className="truncate">{t('studio.toolsAndMcp')}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 mt-0.5">
                        {getFilteredToolPresets().slice(0, 4).map((preset) => {
                          const IconComp = preset.icon;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => {
                                setIsAddMenuOpen(false);
                                addToolPreset(preset, getCanvasCenterPos());
                              }}
                              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left hover:bg-[#EFF5F1] transition cursor-pointer text-xs font-semibold text-[#16422B] min-w-0"
                              title={tr(preset.category)}
                            >
                              <IconComp className={`w-3.5 h-3.5 shrink-0 ${preset.color}`} />
                              <span className="truncate text-[11px]">{tr(preset.name)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Botão Catálogo Completo no Dropdown + */}
                    <div className="pt-1 border-t border-[#E2E8E4]">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddMenuOpen(false);
                          handleOpenCatalog({ initialTab: 'all' });
                        }}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 transition cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <span className="truncate">{t('studio.exploreCatalog')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Botão de Diagnóstico de Ferramentas */}
              <button
                type="button"
                onClick={checkAllToolsHealth}
                disabled={isCheckingTools}
                className="p-2 text-xs font-bold bg-[#7E5BB5] hover:bg-[#68469E] text-white rounded-xl shadow-2xs transition shrink-0 disabled:opacity-50 cursor-pointer"
                title={isCheckingTools ? t('studio.testingTools') : t('studio.testToolsTooltip')}
              >
                <Activity className={`w-4 h-4 ${isCheckingTools ? 'animate-spin' : ''}`} />
              </button>

              {/* Botão Otimizar Custos de IA (Frugal AI) */}
              <button
                type="button"
                onClick={optimizeModelsByCost}
                className="p-2 text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl shadow-2xs transition shrink-0 cursor-pointer"
                title={t('studio.optimizeCostsTooltip')}
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
              </button>

              {/* Auto-Organizar Layout em Grade (ELK) */}
              <button
                type="button"
                onClick={handleAutoOrganize}
                title={t('studio.organizeTooltip')}
                className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-bold text-[#16422B] bg-[#EFF5F1] hover:bg-[#E2E8E4] rounded-xl shadow-2xs transition shrink-0 cursor-pointer whitespace-nowrap"
              >
                <LayoutGrid className="w-4 h-4 text-[#16422B] shrink-0" />
                <span className="hidden xl:inline text-[11px]">{t('studio.organize')}</span>
              </button>

              {/* Salvar Fluxo */}
              <button
                type="button"
                onClick={() => handleSave()}
                className={`flex items-center gap-1.5 px-2.5 py-2 text-xs font-bold rounded-xl shadow-2xs transition shrink-0 cursor-pointer whitespace-nowrap ${
                  hasUnsavedChanges
                    ? 'bg-[#16422B] hover:bg-[#123522] text-white ring-2 ring-amber-400 ring-offset-1 animate-pulse'
                    : 'bg-[#16422B] hover:bg-[#2B6143] text-white'
                }`}
                title={hasUnsavedChanges ? t('studio.unsavedTooltip') : t('studio.saveTooltip')}
              >
                <Save className="w-4 h-4 shrink-0" />
                <span className="hidden xl:inline text-[11px]">{t('studio.save')}</span>
              </button>
            </>
          ) : (
            <span
              className="p-2 text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200 rounded-xl shadow-2xs shrink-0"
              title={t('studio.readOnlyTooltip')}
            >
              <Eye className="w-4 h-4 text-amber-700" />
            </span>
          )}
        </div>
      </div>

      {/* Alerta Visual de Alterações Não Salvas */}
      {hasUnsavedChanges && !savedToast && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 bg-amber-500/95 backdrop-blur-md text-white text-xs font-bold px-4 py-2 rounded-2xl shadow-xl border border-amber-300 animate-in fade-in slide-in-from-top-2 whitespace-nowrap">
          <AlertTriangle className="w-4 h-4 text-white shrink-0 animate-bounce" />
          <span>{t('studio.unsavedBanner')}</span>
          <button
            onClick={() => handleSave()}
            className="ml-2 px-3 py-1 bg-white text-amber-900 rounded-xl text-[11px] font-extrabold hover:bg-amber-50 transition cursor-pointer shadow-xs flex items-center gap-1 shrink-0"
          >
            <Save className="w-3 h-3 shrink-0" />
            <span>{t('studio.saveNow')}</span>
          </button>
        </div>
      )}

      {savedToast && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-[#16422B] text-white text-xs font-bold px-4 py-2 rounded-xl shadow-lg animate-in fade-in flex items-center gap-2 whitespace-nowrap">
          <Check className="w-4 h-4 text-[#8EE59D] shrink-0" />
          <span>{t('studio.savedToast')}</span>
        </div>
      )}

      {/* Canvas com Textos Vetoriais Nítidos no Zoom */}
      <div
        className="w-full h-full relative overflow-hidden"

        onMouseMove={(e) => {
          mouseScreenPosRef.current = { x: e.clientX, y: e.clientY };
        }}
        onMouseLeave={() => {
          mouseScreenPosRef.current = null;
        }}
        onMouseDownCapture={(e) => {
          if (e.button === 1) {
            e.preventDefault();
          }
        }}
        onAuxClick={(e) => {
          if (e.button === 1) {
            e.preventDefault();
          }
        }}
      >
        {!isCanvasVisible && (
          <div className="absolute inset-0 z-50 bg-[#F8FAF9] flex flex-col items-center justify-center select-none pointer-events-auto transition-opacity duration-300">
            <div className="flex flex-col items-center p-8 bg-white border border-[#E2E8E4] rounded-3xl shadow-xl max-w-sm text-center">
              <CompanyLogo
                className="h-10 max-w-[210px] mb-4 object-contain animate-pulse"
              />
              <h3 className="text-sm font-extrabold text-[#16422B] tracking-tight">
                {t('studio.loadingTitle')}
              </h3>
              <p className="text-xs text-[#5A6B61] mt-1.5 font-medium leading-relaxed">
                {t('studio.loadingDesc')}
              </p>
              <div className="w-full bg-[#EFF5F1] h-1.5 rounded-full overflow-hidden mt-5">
                <div className="bg-[#16422B] h-full rounded-full animate-pulse" style={{ width: '65%' }} />
              </div>
            </div>
          </div>
        )}
        <ReactFlow
          nodes={enrichedNodes}
          edges={enrichedEdges}
          nodesDraggable={isAdmin}
          nodesConnectable={isAdmin}
          edgesFocusable={isAdmin}
          edgesReconnectable={isAdmin}
          deleteKeyCode={isAdmin ? ['Backspace', 'Delete'] : null}
          elementsSelectable={true}
          onInit={setRfInstance}
          onNodesChange={isAdmin ? onNodesChange : undefined}
          onEdgesChange={isAdmin ? onEdgesChange : undefined}
          onNodeDragStop={isAdmin ? onNodeDragStop : undefined}
          onNodeResizeStop={isAdmin ? () => { pushHistory(nodes, edges); setHasUnsavedChanges(true); } : undefined}
          onConnect={isAdmin ? onConnect : undefined}
          onNodeClick={onNodeClick}
          onNodeContextMenu={onNodeContextMenu}
          onEdgeContextMenu={isAdmin ? onEdgeContextMenu : undefined}
          onEdgeDoubleClick={isAdmin ? onEdgeDoubleClick : undefined}
          onPaneContextMenu={onPaneContextMenu}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          minZoom={0.2}
          maxZoom={1.5}
          snapToGrid={false}
          elevateNodesOnSelect={true}
          panOnDrag={[0, 1]}
          panOnScroll={panOnScroll}
          panOnScrollMode="free"
          panOnScrollSpeed={0.8}
          zoomOnPinch={true}
          zoomOnScroll={!panOnScroll}
          panActivationKeyCode={['Space']}
          defaultEdgeOptions={{
            type: 'bezier'
          }}
        >
          <Background color="#CBD5E1" gap={24} size={1.2} />
          <Controls position="bottom-left" className="!bg-white !border-[#E2E8E4] !rounded-xl !shadow-md !mb-2 md:!mb-0" />
          <MiniMap
            nodeColor={(n) => (n.type === 'agent' ? '#16422B' : n.type === 'tool' ? '#7E5BB5' : '#CA3D26')}
            className="!bg-white/80 !border-[#E2E8E4] !rounded-xl !hidden md:!block"
          />
        </ReactFlow>
      </div>

      {/* Indicador / Alternador de Navegação (Trackpad 2 dedos vs Mouse Roda) */}
      <div className="absolute bottom-4 left-16 md:left-20 z-20 hidden sm:flex items-center gap-2 bg-white/95 backdrop-blur-md border border-[#E2E8E4] px-3 py-1.5 rounded-2xl shadow-md text-xs pointer-events-auto whitespace-nowrap">
        <button
          type="button"
          onClick={togglePanMode}
          className="flex items-center gap-1.5 font-bold text-[#16422B] hover:text-[#2B6143] transition cursor-pointer"
        >
          {panOnScroll ? (
            <>
              <Laptop className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>{t('studio.trackpadMode')}</span>
            </>
          ) : (
            <>
              <MousePointer className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>{t('studio.mouseMode')}</span>
            </>
          )}
        </button>
        <span className="text-[#CBD5E1]">|</span>
        <span className="text-[11px] text-[#5A6B61] flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
          {t('studio.middleClickDrag')}
        </span>
      </div>

      {/* Menu de Botão Direito (Context Menu) */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          targetNode={contextMenu.targetNode}
          targetEdge={contextMenu.targetEdge}
          isAdmin={isAdmin}
          onClose={() => setContextMenu(null)}
          onConfigure={(node) => setSelectedNode(node)}
          onDelete={(node) => handleDeleteNode(node)}
          onDeleteEdge={(edge) => handleDeleteEdge(edge)}
          onDuplicate={(node) => handleDuplicateNode(node)}
          onMemory={(node) => setMemoryAgent(node)}
          onPersonality={(node) => setPersonalityAgent(node)}
          onWorkspace={(node) => setWorkspaceAgent(node)}
          onAddAgent={(pos) => addCustomAgent({ ...pos, isScreen: true }, pos?.isLead)}
          onAddToolPreset={(preset, pos) => addToolPreset(preset, { ...pos, isScreen: true })}
          onAddTriggerPreset={(preset, pos) => addTriggerPreset(preset, { ...pos, isScreen: true })}
          onOpenCatalog={handleOpenCatalog}
          onOrganize={handleAutoOrganize}
        />
      )}

      {/* Modal do Catálogo Completo (Tools, Triggers, Agents) */}
      <CatalogModal
        isOpen={catalogState.isOpen}
        initialTab={catalogState.initialTab}
        onClose={() => setCatalogState((prev) => ({ ...prev, isOpen: false }))}
        onSelectAgent={(preset) => {
          const pos = catalogState.position ? { ...catalogState.position, isScreen: true } : getCanvasCenterPos();
          addCustomAgent(pos, false, preset);
          setCatalogState((prev) => ({ ...prev, isOpen: false }));
        }}
        onSelectTrigger={(preset) => {
          const pos = catalogState.position ? { ...catalogState.position, isScreen: true } : getCanvasCenterPos();
          addTriggerPreset(preset, pos);
          setCatalogState((prev) => ({ ...prev, isOpen: false }));
        }}
        onSelectTool={(preset) => {
          const pos = catalogState.position ? { ...catalogState.position, isScreen: true } : getCanvasCenterPos();
          addToolPreset(preset, pos);
          setCatalogState((prev) => ({ ...prev, isOpen: false }));
        }}
      />

      {/* Modal do Town Hall (Objetivos Globais AI Board) */}
      <TownHallModal
        isOpen={isTownHallOpen}
        user={user}
        onClose={() => setIsTownHallOpen(false)}
      />

      {/* Modal de Histórico, Auditoria & Diffs */}
      <CanvasHistoryModal
        isOpen={isHistoryModalOpen}
        user={user}
        onClose={() => setIsHistoryModalOpen(false)}
        onRollbackSuccess={async () => {
          try {
            const res = await fetch('/api/canvas/topology', {
              headers: { 'X-User-Email': user?.email || '' }
            });
            if (res.ok) {
              const data = await res.json();
              if (data && data.nodes && data.edges) {
                setNodes(data.nodes);
                setEdges(data.edges);
                setHistory([{ nodes: data.nodes, edges: data.edges }]);
                setHistoryIndex(0);
                setHasUnsavedChanges(false);
              }
            }
          } catch (e) {
            console.error('Erro ao recarregar topologia após rollback:', e);
          }
        }}
      />

      {/* Gaveta de Memória Individual do Agente */}
      {memoryAgent && (
        <AgentMemoryDrawer
          agent={memoryAgent}
          user={user}
          onClose={() => setMemoryAgent(null)}
        />
      )}

      {/* Gaveta de Personalidade & Tom do Agente */}
      {personalityAgent && (
        <AgentPersonalityDrawer
          agent={personalityAgent}
          user={user}
          onClose={() => setPersonalityAgent(null)}
        />
      )}

      {/* Gaveta de Workspace & Ferramentas Autônomas do Agente (Frugal AI) */}
      {workspaceAgent && (
        <AgentWorkspaceDrawer
          agent={workspaceAgent}
          user={user}
          onClose={() => setWorkspaceAgent(null)}
        />
      )}

      {/* Gaveta / Modal de Configuração do Bloco com Markdown Preview no Goal */}
      {selectedNode && (
        <div className="fixed inset-x-3 bottom-20 md:inset-auto md:top-20 md:right-4 md:bottom-4 md:w-96 max-h-[85vh] md:max-h-none bg-white border border-[#E2E8E4] rounded-3xl shadow-2xl p-5 z-50 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8E4]">
              <div className="flex items-center gap-2 min-w-0">
                <Sliders className="w-4 h-4 text-[#16422B] shrink-0" />
                <h3 className="font-extrabold text-sm text-[#16422B] truncate">
                  {selectedNode.type === 'agent'
                    ? t('studio.configAgent')
                    : selectedNode.type === 'trigger'
                    ? t('studio.configTrigger')
                    : t('studio.configTool')}
                </h3>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-500 transition shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedNode.type === 'agent' ? (
              <>
                {/* Tipo de Agente: Especialista vs Líder */}
                <div>
                  <label className="block text-xs font-bold text-[#5A6B61] mb-1">{t('studio.roleHierarchy')}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => updateSelectedNode('isLead', false)}
                      className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap truncate ${
                        !selectedNode.data.isLead
                          ? 'bg-[#16422B] text-white border-[#16422B] shadow-2xs'
                          : 'bg-white text-[#5A6B61] border-[#E2E8E4] hover:bg-gray-50'
                      }`}
                    >
                      <Bot className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{t('studio.specialist')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSelectedNode('isLead', true)}
                      className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap truncate ${
                        selectedNode.data.isLead
                          ? 'bg-[#CA3D26] text-white border-[#CA3D26] shadow-2xs'
                          : 'bg-white text-[#5A6B61] border-[#E2E8E4] hover:bg-gray-50'
                      }`}
                    >
                      <Crown className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{t('studio.leadCeo')}</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-[#5A6B61] mt-1 leading-tight">
                    {selectedNode.data.isLead
                      ? t('studio.leadDesc')
                      : t('studio.specialistDesc')}
                  </p>
                  {selectedNode.data.isLead && (
                    <button
                      type="button"
                      onClick={() => setIsTownHallOpen(true)}
                      className="mt-2 w-full py-2 px-3 rounded-xl bg-[#EFF5F1] hover:bg-[#E2EFE7] border border-[#16422B]/30 text-[#16422B] text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                    >
                      <Building2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{t('studio.configChatFormat')}</span>
                    </button>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-[#5A6B61]">{t('studio.departmentArea')}</label>
                    {(() => {
                      const currentDept = departments.find(d => d.id === selectedNode.data.department);
                      return currentDept ? (
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md border truncate max-w-[160px]"
                          style={{
                            backgroundColor: `${currentDept.color || '#16422B'}15`,
                            color: currentDept.color || '#16422B',
                            borderColor: `${currentDept.color || '#16422B'}30`
                          }}
                        >
                          {tr(currentDept.label || currentDept.name)}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <div className="relative">
                    <select
                      value={selectedNode.data.department || ''}
                      onChange={(e) => updateSelectedNode('department', e.target.value)}
                      className="w-full text-xs font-semibold p-2.5 border border-[#E2E8E4] rounded-xl bg-white focus:outline-none focus:border-[#16422B] text-gray-800 cursor-pointer shadow-2xs appearance-none pr-8 transition"
                      style={{
                        borderLeftWidth: '4px',
                        borderLeftColor: departments.find(d => d.id === selectedNode.data.department)?.color || '#16422B'
                      }}
                    >
                      {departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {tr(dept.label || dept.name || dept.id.toUpperCase())}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-gray-400">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#5A6B61] mb-1">{t('studio.roleLabel')}</label>
                  <input
                    type="text"
                    value={selectedNode.data.role}
                    onChange={(e) => updateSelectedNode('role', e.target.value)}
                    className="w-full text-xs font-semibold p-2.5 border border-[#E2E8E4] rounded-xl focus:outline-none focus:border-[#16422B]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#5A6B61] mb-1">{t('studio.nameLabel')}</label>
                  <input
                    type="text"
                    value={selectedNode.data.name}
                    onChange={(e) => updateSelectedNode('name', e.target.value)}
                    className="w-full text-xs font-semibold p-2.5 border border-[#E2E8E4] rounded-xl focus:outline-none focus:border-[#16422B]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-[#5A6B61]">{t('studio.aiModel')}</label>
                    <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      {selectedNode.data.model?.includes('Lite') || selectedNode.data.model?.includes('lite')
                        ? '⚡ Frugal ($0.25 - $0.30/M)'
                        : selectedNode.data.model?.includes('Pro') || selectedNode.data.model?.includes('pro')
                        ? '🧠 Complex ($2.00/M)'
                        : '⚖️ Standard ($0.75/M)'}
                    </span>
                  </div>
                  <select
                    value={selectedNode.data.model || 'Gemini 3.8 Flash'}
                    onChange={(e) => updateSelectedNode('model', e.target.value)}
                    className="w-full text-xs font-semibold p-2.5 border border-[#E2E8E4] rounded-xl bg-white focus:outline-none focus:border-[#16422B]"
                  >
                    <option value="Gemini 3.1 Flash-Lite">Gemini 3.1 Flash-Lite (Ultra Frugal - US$ 0.25/M)</option>
                    <option value="Gemini 3.5 Flash-Lite">Gemini 3.5 Flash-Lite (Fast Frugal - US$ 0.30/M)</option>
                    <option value="Gemini 3.8 Flash">Gemini 3.8 Flash (Recommended Balance - US$ 0.75/M)</option>
                    <option value="Gemini 3.5 Flash">Gemini 3.5 Flash (Versatile - US$ 0.75/M)</option>
                    <option value="Gemini 3.1 Pro">Gemini 3.1 Pro (Complex Reasoning - US$ 2.00/M)</option>
                  </select>
                </div>

                {/* Objetivo (Goal) com Editor e Preview Markdown */}
                <div>
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <label className="text-xs font-bold text-[#5A6B61] truncate">{t('studio.goalLabel')}</label>
                    <div className="flex bg-gray-100 p-0.5 rounded-lg border border-[#E2E8E4] shrink-0">
                      <button
                        type="button"
                        onClick={() => setGoalTab('editor')}
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition flex items-center gap-1 whitespace-nowrap ${
                          goalTab === 'editor' ? 'bg-white shadow-2xs text-[#16422B]' : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        <Edit3 className="w-2.5 h-2.5 shrink-0" /> {t('studio.editTab')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setGoalTab('preview')}
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition flex items-center gap-1 whitespace-nowrap ${
                          goalTab === 'preview' ? 'bg-white shadow-2xs text-[#16422B]' : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        <Eye className="w-2.5 h-2.5 shrink-0" /> {t('studio.previewTab')}
                      </button>
                    </div>
                  </div>

                  {goalTab === 'editor' ? (
                    <textarea
                      rows={4}
                      value={selectedNode.data.goal}
                      onChange={(e) => updateSelectedNode('goal', e.target.value)}
                      className="w-full text-xs p-2.5 border border-[#E2E8E4] rounded-xl focus:outline-none focus:border-[#16422B] font-mono text-[11px] leading-relaxed"
                      placeholder={t('studio.goalPlaceholder')}
                    />
                  ) : (
                    <div className="p-3 bg-[#F8FAF9] border border-[#E2E8E4] rounded-xl max-h-36 overflow-y-auto text-xs leading-relaxed">
                      <MarkdownRenderer content={selectedNode.data.goal || t('studio.noGoalDefined')} />
                    </div>
                  )}
                </div>

                {/* Botões de Acesso Exclusivos no Menu Lateral: Memória e Personalidade */}
                <div className="pt-2 border-t border-[#E2E8E4] space-y-2">
                  <div className="text-[11px] font-bold text-[#5A6B61] flex items-center justify-between">
                    <span>{t('studio.memoryAndPersonality')}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMemoryAgent(selectedNode)}
                      className="p-2 bg-[#EFF5F1] hover:bg-[#E2E8E4] text-[#7E5BB5] border border-[#E2E8E4] rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer truncate"
                      title={t('studio.memoryBtn')}
                    >
                      <Brain className="w-3.5 h-3.5 text-[#7E5BB5] shrink-0" />
                      <span className="truncate">{t('studio.memoryBtn')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPersonalityAgent(selectedNode)}
                      className="p-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer truncate"
                      title={t('studio.voiceToneBtn')}
                    >
                      <Smile className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="truncate">{t('studio.voiceToneBtn')}</span>
                    </button>
                  </div>
                </div>

                {/* Botão de Workspace & Ferramentas Próprias (Frugal AI) */}
                <div className="pt-2 border-t border-[#E2E8E4]">
                  <button
                    type="button"
                    onClick={() => {
                      setWorkspaceAgent(selectedNode);
                      setSelectedNode(null);
                    }}
                    className="w-full p-2.5 bg-gradient-to-r from-emerald-50 via-teal-50 to-green-50 hover:from-emerald-100 hover:to-teal-100 text-emerald-950 border border-emerald-200 rounded-2xl font-black text-xs flex items-center justify-between transition shadow-2xs cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-1.5 rounded-lg bg-emerald-200/80 text-emerald-900 shrink-0">
                        <Terminal className="w-3.5 h-3.5 text-emerald-800" />
                      </div>
                      <div className="text-left min-w-0">
                        <span className="block font-black text-xs truncate">{t('studio.workspaceAndTools')}</span>
                        <span className="block text-[10px] text-emerald-800/80 font-semibold truncate">{t('studio.workspaceSubtitle')}</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-200/90 text-emerald-950 border border-emerald-300 shrink-0">
                      Frugal AI
                    </span>
                  </button>
                </div>

                {/* SEÇÃO DE TAREFAS AGENDADAS (CRON) */}
                <div className="pt-3 border-t border-[#E2E8E4] space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-[#16422B] min-w-0">
                      <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="truncate">{t('studio.scheduledTasks')}</span>
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setShowAddCronModal(true)}
                        className="text-[10px] font-extrabold px-2 py-1 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
                      >
                        <Plus className="w-3 h-3 shrink-0" />
                        <span>{t('studio.scheduleTask')}</span>
                      </button>
                    )}
                  </div>

                  {/* Lista de Tarefas Agendadas deste Agente */}
                  <div className="space-y-1.5">
                    {(!selectedNode.data.scheduledTasks || selectedNode.data.scheduledTasks.length === 0) ? (
                      <div className="p-2.5 rounded-xl bg-[#F8FAF9] border border-dashed border-[#E2E8E4] text-[11px] text-[#5A6B61] text-center">
                        {t('studio.noScheduledTasks')}
                      </div>
                    ) : (
                      selectedNode.data.scheduledTasks.map((task) => (
                        <div
                          key={task.id}
                          className="p-2.5 rounded-xl border border-[#E2E8E4] bg-white hover:border-blue-200 transition space-y-1"
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-xs text-[#1A202C] leading-snug truncate">
                                {task.title}
                              </div>
                              <div className="text-[10px] text-[#5A6B61] line-clamp-1 mt-0.5">
                                {task.instruction}
                              </div>
                            </div>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`${t('common.delete')} '${task.title}'?`)) {
                                    const updated = (selectedNode.data.scheduledTasks || []).filter(t => t.id !== task.id);
                                    updateSelectedNode('scheduledTasks', updated);
                                  }
                                }}
                                title={t('common.delete')}
                                className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition shrink-0 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          
                          <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-[10px]">
                            <span className="inline-flex items-center gap-1 font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                              <Clock className="w-2.5 h-2.5" />
                              <span>{task.frequency || t('node.scheduled')}</span>
                            </span>
                            <span className="font-mono text-gray-500 text-[9px] bg-gray-100 px-1.5 py-0.5 rounded">
                              {task.cron || '0 0 * * *'}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : selectedNode.type === 'trigger' ? ((() => {
              const rawType = selectedNode.data.type || 'webhook';
              const normalizedType = rawType === 'chatwoot' ? 'chatwoot_event'
                : rawType === 'freescout' ? 'freescout_event'
                : rawType === 'gmail' ? 'gmail_event'
                : (rawType === 'delivery' || rawType === 'delivery_event') ? 'ifood_event'
                : rawType;

              const isDelivery = ['ifood_event', '99food_event', 'entrega_aki_event', 'delivery_event', 'delivery'].includes(normalizedType);
              const isGmail = ['gmail_event', 'gmail'].includes(normalizedType);
              const isChatwoot = ['chatwoot_event', 'chatwoot'].includes(normalizedType);
              const isFreescout = ['freescout_event', 'freescout'].includes(normalizedType);
              const isCron = normalizedType === 'cron';
              const isWebhook = normalizedType === 'webhook';
              const isCustom = normalizedType === 'custom';
              const isTelegram = normalizedType === 'telegram';
              const isWhatsapp = normalizedType === 'whatsapp';

              // Fallback e valores atuais
              const deliveryConfig = DELIVERY_PLATFORMS_META[normalizedType] || DELIVERY_PLATFORMS_META['entrega_aki_event'];
              const currentDefaultCauses = isDelivery && deliveryConfig ? deliveryConfig.defaultCauses : ['order_status', 'store_catalog'];
              const enabledCauses = Array.isArray(selectedNode.data.enabledCauses)
                ? selectedNode.data.enabledCauses
                : currentDefaultCauses;
              const autoDetectCause = selectedNode.data.autoDetectCause !== false;

              const handleToggleCause = (causeId) => {
                const next = enabledCauses.includes(causeId)
                  ? enabledCauses.filter(c => c !== causeId)
                  : [...enabledCauses, causeId];
                updateSelectedNode('enabledCauses', next);
              };

              const currentHost = typeof window !== 'undefined' ? window.location.origin : 'https://localhost:8000';

              // Endpoint de delivery
              const deliveryEndpoint = normalizedType === 'ifood_event' ? '/api/webhooks/ifood'
                : normalizedType === '99food_event' ? '/api/webhooks/99food'
                : '/api/webhooks/entrega-aki';

              // Logo type para o PlatformLogo
              const logoType = normalizedType === 'ifood_event' ? 'ifood'
                : normalizedType === '99food_event' ? '99food'
                : normalizedType === 'entrega_aki_event' ? 'entrega_aki'
                : normalizedType === 'chatwoot_event' ? 'chat'
                : normalizedType === 'gmail_event' ? 'gmail'
                : normalizedType === 'freescout_event' ? 'freescout'
                : normalizedType === 'telegram' ? 'telegram'
                : normalizedType === 'whatsapp' ? 'whatsapp'
                : normalizedType;

              // Nome humanizado do serviço
              const serviceNames = {
                ifood_event: 'iFood Marketplace',
                '99food_event': '99 Food Marketplace',
                entrega_aki_event: 'Entrega Aki (Delivery Próprio)',
                chatwoot_event: 'Chatwoot SAC (WhatsApp)',
                gmail_event: 'Gmail (Contas a Pagar & Boletos)',
                freescout_event: 'FreeScout Helpdesk',
                cron: 'Temporizador Cron',
                webhook: 'Webhook HTTP Genérico',
                custom: 'Gatilho Sob Medida (REST)',
                telegram: 'Telegram Bot',
                whatsapp: 'WhatsApp / Evolution API'
              };

              const fam = getSharedConnectionFamily(selectedNode);
              const siblingNode = fam ? nodes.find((n) => n.id !== selectedNode.id && getSharedConnectionFamily(n) === fam) : null;
              const rawTs =
                (toolDiagnosticResult && toolDiagnosticResult.updated_at) ||
                selectedNode.data.healthUpdatedAt ||
                siblingNode?.data?.healthUpdatedAt ||
                (selectedNode.data.healthStatus ? localStorage.getItem('aiboard_last_tool_check_ts') : null);

              const health = toolDiagnosticResult || {
                status: selectedNode.data.healthStatus || siblingNode?.data?.healthStatus || 'online',
                status_label: selectedNode.data.healthLabel || siblingNode?.data?.healthLabel,
                latency_ms: selectedNode.data.healthLatency ?? siblingNode?.data?.healthLatency,
                details: selectedNode.data.healthDetails || siblingNode?.data?.healthDetails,
                updated_at: rawTs
              };
              const isOnline = health.status === 'online';
              const isWarning = health.status === 'warning';

              return (
                <div className="space-y-4">
                  {/* Header Card de Identificação da Plataforma */}
                  <div className="p-3 rounded-2xl bg-orange-50/80 border border-orange-100 flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-white shadow-2xs border border-orange-200 flex items-center justify-center shrink-0">
                        <PlatformLogo type={logoType} size="sm" className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-[#CA3D26]" />
                          <span className="font-extrabold text-xs text-[#CA3D26]">{t('studio.reactiveTrigger')}</span>
                        </div>
                        <p className="text-[10px] font-bold text-gray-700 truncate">
                          {serviceNames[normalizedType] || 'Canal Integrado'}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                        isOnline
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : isWarning
                          ? 'bg-amber-100 text-amber-900 border-amber-200'
                          : 'bg-rose-100 text-rose-800 border-rose-200'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isOnline ? 'bg-emerald-500 animate-pulse' : isWarning ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                      />
                      {health.status_label || (isOnline ? t('node.online') : isWarning ? t('node.pending') : t('node.disconnected'))}
                    </span>
                  </div>

                  {/* Card de Diagnóstico & Teste de Conexão em Tempo Real (Independente de Ferramenta) */}
                  <div
                    className={`p-3 rounded-2xl border ${
                      isOnline
                        ? 'bg-emerald-50/60 border-emerald-200'
                        : isWarning
                        ? 'bg-amber-50/60 border-amber-200'
                        : 'bg-rose-50/60 border-rose-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-extrabold flex items-center gap-1.5 text-gray-800">
                        <Activity
                          className={`w-3.5 h-3.5 ${
                            isOnline ? 'text-emerald-600' : isWarning ? 'text-amber-600' : 'text-rose-600'
                          }`}
                        />
                        {t('studio.triggerDiagnostics')}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border whitespace-nowrap shrink-0 ml-2 ${
                          isOnline
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : isWarning
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : 'bg-rose-100 text-rose-800 border-rose-300'
                        }`}
                      >
                        {isOnline ? t('studio.connected') : isWarning ? t('studio.pending') : t('studio.disconnected')}
                      </span>
                    </div>

                    <p className="text-[11px] text-gray-700 leading-relaxed mb-2.5">
                      {health.details ||
                        (isOnline
                          ? 'Gatilho operacional, autenticado e escutando eventos em tempo real.'
                          : isWarning
                          ? 'Credenciais ou parâmetros de conexão pendentes para este gatilho.'
                          : 'Serviço ou banco de dados de eventos inalcançável.')}
                    </p>

                    <div className="flex items-center justify-between pt-2 border-t border-gray-200/60">
                      <span className="text-[10px] font-mono font-semibold text-gray-500">
                        {health.latency_ms !== undefined && health.latency_ms !== null
                          ? `${t('studio.latency')}: ${health.latency_ms}ms`
                          : `${t('studio.latency')}: --`}
                      </span>
                      <button
                        type="button"
                        onClick={() => testSingleTool(selectedNode)}
                        disabled={testingToolId === selectedNode.id}
                        className="px-2.5 py-1 text-[10px] font-extrabold bg-white border border-gray-300 hover:border-gray-400 rounded-lg shadow-2xs transition flex items-center gap-1 text-gray-700 hover:text-gray-900 disabled:opacity-50 cursor-pointer"
                      >
                        <Activity
                          className={`w-3 h-3 text-[#CA3D26] ${testingToolId === selectedNode.id ? 'animate-spin' : ''}`}
                        />
                        {testingToolId === selectedNode.id ? t('studio.testingNow') : t('studio.testNow')}
                      </button>
                    </div>

                    <div className="mt-2 pt-2 border-t border-gray-200/50 flex items-center justify-between text-[10px]">
                      <span className="flex items-center gap-1 text-gray-500 font-medium">
                        <Clock className="w-3 h-3 text-gray-400 shrink-0" />
                        {t('studio.lastTested')}
                      </span>
                      <span className="font-mono font-bold text-gray-700 bg-white/80 px-2 py-0.5 rounded-md border border-gray-200 shadow-2xs">
                        {formatTestedAt(health.updated_at || rawTs) || t('studio.notTestedYet')}
                      </span>
                    </div>
                  </div>

                  {/* Nome do Gatilho */}
                  <div>
                    <label className="block text-xs font-bold text-[#5A6B61] mb-1">{t('studio.triggerLabel')}</label>
                    <input
                      type="text"
                      value={selectedNode.data.label || selectedNode.data.name || ''}
                      onChange={(e) => {
                        updateSelectedNode('label', e.target.value);
                        updateSelectedNode('name', e.target.value);
                      }}
                      className="w-full text-xs font-semibold p-2.5 border border-[#E2E8E4] rounded-xl focus:outline-none focus:border-[#CA3D26]"
                    />
                  </div>

                  {/* Canal de Entrada (Tipo) */}
                  <div>
                    <label className="block text-xs font-bold text-[#5A6B61] mb-1">{t('studio.inputChannel')}</label>
                    <select
                      value={normalizedType}
                      onChange={(e) => {
                        const newType = e.target.value;
                        updateSelectedNode('type', newType);
                        if (['ifood_event', '99food_event', 'entrega_aki_event'].includes(newType)) {
                          const conf = DELIVERY_PLATFORMS_META[newType];
                          if (conf) {
                            updateSelectedNode('enabledCauses', conf.defaultCauses);
                          }
                          if (selectedNode.data.autoDetectCause === undefined) updateSelectedNode('autoDetectCause', true);
                        } else if (newType === 'gmail_event') {
                          if (selectedNode.data.unreadOnly === undefined) updateSelectedNode('unreadOnly', true);
                          if (selectedNode.data.hasAttachment === undefined) updateSelectedNode('hasAttachment', false);
                        } else if (newType === 'cron') {
                          if (!selectedNode.data.cron) updateSelectedNode('cron', '0 9 * * 1-5');
                        }
                      }}
                      className="w-full text-xs font-semibold p-2.5 border border-[#E2E8E4] rounded-xl bg-white focus:outline-none focus:border-[#CA3D26]"
                    >
                      <optgroup label="🛵 Delivery & Marketplaces">
                        <option value="ifood_event">iFood Marketplace (Webhook & Radar)</option>
                        <option value="99food_event">99 Food Marketplace (Webhook & Radar)</option>
                        <option value="entrega_aki_event">Entrega Aki (Delivery Próprio)</option>
                      </optgroup>
                      <optgroup label="💬 Canais de Atendimento & Comunicação">
                        <option value="chatwoot_event">Chatwoot (WhatsApp SAC & Multimodal)</option>
                        <option value="gmail_event">Gmail (Faturas, Notas Fiscais & E-mails)</option>
                        <option value="freescout_event">FreeScout (Chamados Helpdesk de Lojas)</option>
                        <option value="telegram">Telegram Bot</option>
                        <option value="whatsapp">WhatsApp / Evolution API</option>
                      </optgroup>
                      <optgroup label="⏱️ Agendamento & Integrações HTTP">
                        <option value="cron">Agendamento Cron (Tempo / Timer)</option>
                        <option value="webhook">Webhook HTTP Genérico</option>
                        <option value="custom">Gatilho Sob Medida (REST Custom)</option>
                      </optgroup>
                    </select>
                  </div>

                  {/* Subtítulo / Descrição */}
                  <div>
                    <label className="block text-xs font-bold text-[#5A6B61] mb-1">{t('studio.subtitleDesc')}</label>
                    <input
                      type="text"
                      value={selectedNode.data.subtitle || ''}
                      onChange={(e) => updateSelectedNode('subtitle', e.target.value)}
                      placeholder="Ex: Escutando pedidos ou chamados em tempo real"
                      className="w-full text-xs font-semibold p-2.5 border border-[#E2E8E4] rounded-xl focus:outline-none focus:border-[#CA3D26]"
                    />
                  </div>

                  {/* ============================================================== */}
                  {/* SEÇÃO ESPECÍFICA: DELIVERY (IFOOD, 99 FOOD, ENTREGA AKI) */}
                  {/* ============================================================== */}
                  {isDelivery && deliveryConfig && (
                    <div className="pt-2 border-t border-[#E2E8E4] space-y-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-[#CA3D26] uppercase tracking-wider block">
                          Configuração: {deliveryConfig.platformName}
                        </span>
                      </div>

                      {/* Banner Informativo / Alerta Operacional da Plataforma */}
                      {normalizedType === 'ifood_event' ? (
                        <div className="p-3.5 rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-50/90 to-teal-50/60 shadow-2xs space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              <span className="text-[11px] font-black text-emerald-950 uppercase tracking-wide">
                                Sessão Portal do Parceiro Conectada
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div className="bg-white/80 p-2 rounded-xl border border-emerald-100">
                              <span className="text-gray-500 block text-[9px] font-semibold">Loja / Unidade:</span>
                              <span className="font-extrabold text-[#16422B] text-xs">Unidade Principal</span>
                              <span className="text-[9px] text-gray-500 block font-mono">Conectado</span>
                            </div>
                            <div className="bg-white/80 p-2 rounded-xl border border-emerald-100">
                              <span className="text-gray-500 block text-[9px] font-semibold">Perfil Autenticado:</span>
                              <span className="font-extrabold text-emerald-900 truncate block">Administrador</span>
                              <span className="text-[9px] text-emerald-700 font-bold block">Acesso Completo</span>
                            </div>
                          </div>

                          <p className="text-[10px] text-emerald-900 leading-relaxed">
                            ✓ O gatilho iFood escuta eventos e novos pedidos diretamente via sessão autenticada do Portal do Parceiro (portal.ifood.com.br) e retaguarda no Radar ERP, sem necessidade de CNAE de tecnologia no CNPJ da empresa.
                          </p>
                        </div>
                      ) : normalizedType === '99food_event' ? (
                        <div className="p-3.5 rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-50/90 to-teal-50/60 shadow-2xs space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              <span className="text-[11px] font-black text-emerald-950 uppercase tracking-wide">
                                Sessão Portal 99 Food Conectada
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div className="bg-white/80 p-2 rounded-xl border border-emerald-100">
                              <span className="text-gray-500 block text-[9px] font-semibold">Loja / Store ID:</span>
                              <span className="font-extrabold text-[#16422B] text-xs">Unidade Principal</span>
                              <span className="text-[9px] text-gray-500 block font-mono">Conectado</span>
                            </div>
                            <div className="bg-white/80 p-2 rounded-xl border border-emerald-100">
                              <span className="text-gray-500 block text-[9px] font-semibold">Perfil Autenticado:</span>
                              <span className="font-extrabold text-emerald-900 truncate block">Administrador</span>
                              <span className="text-[9px] text-emerald-700 font-bold block">Superadministrador</span>
                            </div>
                          </div>

                          <p className="text-[10px] text-emerald-900 leading-relaxed">
                            ✓ Sessão autenticada no Portal do Lojista (merchant.99app.com) com automação Playwright. O gatilho escuta notificações e cruza dados continuamente com o Radar ERP.
                          </p>

                          <div className="pt-1 border-t border-emerald-200/60 flex items-center justify-between text-[9px] text-emerald-800">
                            <span>Tipo de Conexão: <b>Automação Playwright Headless</b></span>
                            <span className="font-mono font-bold text-emerald-900">100% Operacional</span>
                          </div>
                        </div>
                      ) : (
                        <div className={`p-3 rounded-xl border text-xs ${
                          deliveryConfig.bannerType === 'warning'
                            ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                            : deliveryConfig.bannerType === 'info'
                            ? 'bg-sky-50/80 border-sky-200 text-sky-900'
                            : 'bg-indigo-50/80 border-indigo-200 text-indigo-900'
                        }`}>
                          <div className="font-bold flex items-center gap-1.5 mb-1 text-[11px]">
                            {deliveryConfig.bannerTitle}
                          </div>
                          <p className="text-[10px] leading-relaxed opacity-90">
                            {deliveryConfig.bannerText}
                          </p>
                        </div>
                      )}

                      {/* Parâmetros Configuráveis da Integração */}
                      <div className="bg-gray-50/80 border border-[#E2E8E4] rounded-xl p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-[#5A6B61] uppercase tracking-wider block">
                            Parâmetros e Credenciais de Acesso
                          </span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            Configurável
                          </span>
                        </div>

                        {/* ENTREGA AKI */}
                        {normalizedType === 'entrega_aki_event' && (
                          <div className="space-y-2.5">
                            <div>
                              <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                                URL do Gestor Web (Painel de Gestão):
                              </label>
                              <input
                                type="text"
                                value={selectedNode.data.gestor_url !== undefined ? selectedNode.data.gestor_url : 'https://gestor.entregaaki.app.br'}
                                onChange={(e) => updateSelectedNode('gestor_url', e.target.value)}
                                placeholder="https://gestor.entregaaki.app.br"
                                className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#CA3D26]"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                                ID ou CNPJ da Loja (Gestor Web):
                              </label>
                              <input
                                type="text"
                                value={selectedNode.data.gestor_cnpj !== undefined ? selectedNode.data.gestor_cnpj : ''}
                                onChange={(e) => updateSelectedNode('gestor_cnpj', e.target.value)}
                                placeholder="CNPJ sem pontuação"
                                className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#CA3D26]"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                                  Usuário Operador:
                                </label>
                                <input
                                  type="text"
                                  value={selectedNode.data.gestor_user !== undefined ? selectedNode.data.gestor_user : ''}
                                  onChange={(e) => updateSelectedNode('gestor_user', e.target.value)}
                                  placeholder="Usuário"
                                  className="w-full text-xs p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#CA3D26]"
                                />
                              </div>
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-[11px] font-bold text-[#5A6B61]">
                                    Senha:
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => setShowDeliveryPassword(!showDeliveryPassword)}
                                    className="text-[9px] font-bold text-gray-500 hover:text-gray-700 flex items-center gap-0.5 cursor-pointer"
                                  >
                                    {showDeliveryPassword ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                                    {showDeliveryPassword ? 'Ocultar' : 'Exibir'}
                                  </button>
                                </div>
                                <input
                                  type={showDeliveryPassword ? "text" : "password"}
                                  value={selectedNode.data.gestor_pass !== undefined ? selectedNode.data.gestor_pass : ''}
                                  onChange={(e) => updateSelectedNode('gestor_pass', e.target.value)}
                                  placeholder="••••••••••••"
                                  className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#CA3D26]"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* IFOOD */}
                        {normalizedType === 'ifood_event' && (
                          <details className="space-y-2.5 group">
                            <summary className="text-[10px] font-bold text-[#5A6B61] uppercase tracking-wider cursor-pointer list-none flex items-center justify-between">
                              <span>Credenciais Opcionais Developer (developer.ifood.com.br)</span>
                              <span className="text-[9px] font-bold text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                            </summary>

                            <div className="pt-2 space-y-2.5">
                              <div>
                                <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                                  Client ID (developer.ifood.com.br):
                                </label>
                                <input
                                  type="text"
                                  value={selectedNode.data.ifood_client_id || ''}
                                  onChange={(e) => updateSelectedNode('ifood_client_id', e.target.value)}
                                  placeholder="UUID do Client ID da Integração Própria"
                                  className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#CA3D26]"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                                  Client Secret:
                                </label>
                                <div className="relative">
                                  <input
                                    type={showDeliveryPassword ? "text" : "password"}
                                    value={selectedNode.data.ifood_client_secret || ''}
                                    onChange={(e) => updateSelectedNode('ifood_client_secret', e.target.value)}
                                    placeholder="••••••••••••••••"
                                    className="w-full text-xs font-mono p-2 pr-8 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#CA3D26]"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowDeliveryPassword(!showDeliveryPassword)}
                                    className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 cursor-pointer"
                                  >
                                    {showDeliveryPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                                    Merchant ID (Loja):
                                  </label>
                                  <input
                                    type="text"
                                    value={selectedNode.data.ifood_merchant_id || ''}
                                    onChange={(e) => updateSelectedNode('ifood_merchant_id', e.target.value)}
                                    placeholder="UUID da Loja"
                                    className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#CA3D26]"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                                    Polling (segundos):
                                  </label>
                                  <input
                                    type="number"
                                    value={selectedNode.data.ifood_poll_interval !== undefined ? selectedNode.data.ifood_poll_interval : 30}
                                    onChange={(e) => updateSelectedNode('ifood_poll_interval', Number(e.target.value))}
                                    placeholder="30"
                                    className="w-full text-xs font-mono font-semibold p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#CA3D26] text-center"
                                  />
                                </div>
                              </div>
                            </div>
                          </details>
                        )}

                        {/* 99 FOOD */}
                        {normalizedType === '99food_event' && (
                          <details className="space-y-2.5 group">
                            <summary className="text-[10px] font-bold text-[#5A6B61] uppercase tracking-wider cursor-pointer list-none flex items-center justify-between">
                              <span>Credenciais do Portal do Lojista 99 Food</span>
                              <span className="text-[9px] font-bold text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                            </summary>

                            <div className="pt-2 space-y-2.5">
                              <div>
                                <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                                  URL do Portal do Lojista 99:
                                </label>
                                <input
                                  type="text"
                                  value={selectedNode.data.ninety_nine_portal_url !== undefined ? selectedNode.data.ninety_nine_portal_url : 'https://merchant.99app.com'}
                                  onChange={(e) => updateSelectedNode('ninety_nine_portal_url', e.target.value)}
                                  placeholder="https://merchant.99app.com"
                                  className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#CA3D26]"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                                    Usuário / E-mail:
                                  </label>
                                  <input
                                    type="text"
                                    value={selectedNode.data.ninety_nine_user !== undefined ? selectedNode.data.ninety_nine_user : ''}
                                    onChange={(e) => updateSelectedNode('ninety_nine_user', e.target.value)}
                                    placeholder="Ex: lojista@empresa.com"
                                    className="w-full text-xs p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#CA3D26]"
                                  />
                                </div>
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <label className="text-[11px] font-bold text-[#5A6B61]">
                                      Senha do Portal:
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => setShowDeliveryPassword(!showDeliveryPassword)}
                                      className="text-[9px] font-bold text-gray-500 hover:text-gray-700 flex items-center gap-0.5 cursor-pointer"
                                    >
                                      {showDeliveryPassword ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                                      {showDeliveryPassword ? 'Ocultar' : 'Exibir'}
                                    </button>
                                  </div>
                                  <input
                                    type={showDeliveryPassword ? "text" : "password"}
                                    value={selectedNode.data.ninety_nine_password !== undefined ? selectedNode.data.ninety_nine_password : ''}
                                    onChange={(e) => updateSelectedNode('ninety_nine_password', e.target.value)}
                                    placeholder="••••••••••••"
                                    className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#CA3D26]"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                                  Store ID 99 Food (Opcional):
                                </label>
                                <input
                                  type="text"
                                  value={selectedNode.data.ninety_nine_store_id !== undefined ? selectedNode.data.ninety_nine_store_id : ''}
                                  onChange={(e) => updateSelectedNode('ninety_nine_store_id', e.target.value)}
                                  placeholder="Store ID numérico ou UUID"
                                  className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#CA3D26]"
                                />
                              </div>
                            </div>
                          </details>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[11px] font-bold text-[#5A6B61]">Causas Habilitadas para Despertar o Agente:</label>
                          <span className="text-[10px] font-bold text-[#CA3D26]">
                            {enabledCauses.filter(c => deliveryConfig.causes.some(dc => dc.id === c)).length} de {deliveryConfig.causes.length} selecionadas
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {deliveryConfig.causes.map((cause) => {
                            const isChecked = enabledCauses.includes(cause.id);
                            return (
                              <div
                                key={cause.id}
                                role="checkbox"
                                aria-checked={isChecked}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleCause(cause.id);
                                }}
                                className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer select-none active:scale-[0.99] transition-all ${
                                  isChecked
                                    ? 'bg-emerald-50/90 border-emerald-400 shadow-2xs'
                                    : 'bg-gray-50/70 border-gray-200 opacity-60 hover:opacity-100 hover:bg-gray-100/70'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0 pointer-events-none">
                                  <span className="text-base shrink-0">{cause.icon}</span>
                                  <div className="min-w-0">
                                    <div className="text-[11px] font-bold text-gray-900 truncate">{cause.label}</div>
                                    <div className="text-[9px] text-gray-500 truncate">{cause.desc}</div>
                                  </div>
                                </div>
                                <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors pointer-events-none ${
                                  isChecked
                                    ? 'bg-emerald-600 border-emerald-600 text-white'
                                    : 'bg-white border-gray-300'
                                }`}>
                                  {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Auto-detecção inteligente */}
                      <div
                        role="checkbox"
                        aria-checked={autoDetectCause}
                        onClick={() => updateSelectedNode('autoDetectCause', !autoDetectCause)}
                        className={`flex items-center gap-2.5 p-2.5 border rounded-xl cursor-pointer select-none active:scale-[0.99] transition-all ${
                          autoDetectCause
                            ? 'bg-emerald-50/70 border-emerald-300'
                            : 'bg-gray-50 border-gray-200 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors pointer-events-none ${
                          autoDetectCause
                            ? 'bg-[#16422B] border-[#16422B] text-white'
                            : 'bg-white border-gray-300'
                        }`}>
                          {autoDetectCause && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span className="text-[11px] font-semibold text-gray-800 pointer-events-none">
                          Classificação semântica automática de causa pelo payload JSON
                        </span>
                      </div>

                      {/* Teste do Webhook */}
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => testTriggerEvent(selectedNode)}
                          disabled={testingTriggerId === selectedNode.id}
                          className="w-full py-2 px-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
                        >
                          <Activity className={`w-3.5 h-3.5 ${testingTriggerId === selectedNode.id ? 'animate-spin' : ''}`} />
                          <span>{testingTriggerId === selectedNode.id ? 'Simulando Disparo...' : 'Simular Disparo de Teste no Webhook'}</span>
                        </button>
                        {triggerTestResult && (
                          <div className={`mt-2 p-2 rounded-xl text-[10px] font-medium border ${
                            triggerTestResult.ok ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}>
                            {triggerTestResult.message}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ============================================================== */}
                  {/* SEÇÃO ESPECÍFICA: GMAIL (LEITURA & FILTRO DE E-MAILS) */}
                  {/* ============================================================== */}
                  {isGmail && (
                    <div className="pt-2 border-t border-[#E2E8E4] space-y-3.5">
                      <span className="text-[11px] font-bold text-red-600 uppercase tracking-wider block">
                        Conexão & Filtros de Monitoramento Gmail
                      </span>

                      <div className="p-2.5 rounded-xl bg-red-50/70 border border-red-200 text-[11px] text-red-900 leading-relaxed">
                        ✉️ O AI Board monitora a caixa de entrada da empresa em tempo real e encaminha faturas, boletos e comprovantes fiscais detectados para o auditor financeiro (CFO).
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                          Conta Conectada (Gmail OAuth):
                        </label>
                        <input
                          type="email"
                          value={selectedNode.data.gmailAccount ?? siblingNode?.data?.gmailAccount ?? ''}
                          onChange={(e) => updateSelectedNode('gmailAccount', e.target.value)}
                          placeholder="financeiro@empresa.com"
                          className="w-full text-xs font-semibold p-2 border border-[#E2E8E4] rounded-xl focus:border-red-500 outline-none"
                        />
                      </div>

                      {/* Filtro por Remetente */}
                      <div>
                        <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                          Filtrar por Remetente (Opcional):
                        </label>
                        <input
                          type="text"
                          value={selectedNode.data.senderFilter || ''}
                          onChange={(e) => updateSelectedNode('senderFilter', e.target.value)}
                          placeholder="Ex: @banco.com.br, fornecedor@empresa.com"
                          className="w-full text-xs font-semibold p-2 border border-[#E2E8E4] rounded-xl focus:border-red-500 outline-none"
                        />
                        <p className="text-[10px] text-gray-500 mt-0.5">Deixe em branco para monitorar todos os remetentes.</p>
                      </div>

                      {/* Palavras-chave no Assunto */}
                      <div>
                        <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                          Palavras-chave no Assunto (separadas por vírgula):
                        </label>
                        <input
                          type="text"
                          value={selectedNode.data.subjectKeywords !== undefined ? selectedNode.data.subjectKeywords : 'fatura, boleto, nf-e, nota fiscal, comprovante'}
                          onChange={(e) => updateSelectedNode('subjectKeywords', e.target.value)}
                          placeholder="fatura, boleto, nf-e, nota fiscal, comprovante"
                          className="w-full text-xs font-semibold p-2 border border-[#E2E8E4] rounded-xl focus:border-red-500 outline-none"
                        />
                      </div>

                      {/* Opções de Filtro Booleano */}
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-2 p-2 bg-gray-50 border border-[#E2E8E4] rounded-xl cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedNode.data.unreadOnly !== false}
                            onChange={(e) => updateSelectedNode('unreadOnly', e.target.checked)}
                            className="rounded text-red-600 focus:ring-red-500"
                          />
                          <span className="text-[11px] font-semibold text-gray-700">
                            Apenas e-mails Não Lidos (<code className="font-mono text-[10px] bg-white px-1 rounded">is:unread</code>)
                          </span>
                        </label>

                        <label className="flex items-center gap-2 p-2 bg-gray-50 border border-[#E2E8E4] rounded-xl cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!selectedNode.data.hasAttachment}
                            onChange={(e) => updateSelectedNode('hasAttachment', e.target.checked)}
                            className="rounded text-red-600 focus:ring-red-500"
                          />
                          <span className="text-[11px] font-semibold text-gray-700">
                            Exigir documento em anexo (<code className="font-mono text-[10px] bg-white px-1 rounded">has:attachment</code>)
                          </span>
                        </label>
                      </div>

                      {/* Consulta Avançada do Gmail */}
                      <div>
                        <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                          Consulta de Busca Avançada (Sobrescreve filtros acima):
                        </label>
                        <input
                          type="text"
                          value={selectedNode.data.customQuery || ''}
                          onChange={(e) => updateSelectedNode('customQuery', e.target.value)}
                          placeholder="Ex: is:unread has:attachment (fatura OR boleto)"
                          className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl focus:border-red-500 outline-none"
                        />
                      </div>

                      {/* Prévia da Busca Aplicada */}
                      <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl">
                        <div className="text-[10px] font-bold text-gray-500 mb-0.5">Sintaxe Ativa no Gmail API:</div>
                        <code className="text-[11px] font-mono text-red-800 break-all">
                          {selectedNode.data.customQuery?.trim() || (() => {
                            const parts = [];
                            if (selectedNode.data.unreadOnly !== false) parts.push('is:unread');
                            if (selectedNode.data.hasAttachment) parts.push('has:attachment');
                            if (selectedNode.data.senderFilter?.trim()) parts.push(`from:${selectedNode.data.senderFilter.trim()}`);
                            const kw = selectedNode.data.subjectKeywords !== undefined ? selectedNode.data.subjectKeywords : 'fatura, boleto, nf-e, nota fiscal, comprovante';
                            if (kw.trim()) {
                              const terms = kw.split(',').map(t => t.trim()).filter(Boolean);
                              if (terms.length === 1) parts.push(`subject:${terms[0]}`);
                              else if (terms.length > 1) parts.push(`(${terms.map(t => `subject:${t}`).join(' OR ')})`);
                            }
                            return parts.join(' ') || 'is:unread';
                          })()}
                        </code>
                      </div>
                    </div>
                  )}

                  {/* ============================================================== */}
                  {/* SEÇÃO ESPECÍFICA: CHATWOOT SAC (WHATSAPP & MULTIMODAL) */}
                  {/* ============================================================== */}
                  {isChatwoot && (
                    <div className="pt-2 border-t border-[#E2E8E4] space-y-3.5">
                      <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider block">
                        Configuração & Conexão do Chatwoot SAC
                      </span>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">URL Chatwoot Server:</label>
                          <input
                            type="text"
                            value={selectedNode.data.chatwootUrl ?? siblingNode?.data?.chatwootUrl ?? 'http://127.0.0.1:3050'}
                            onChange={(e) => updateSelectedNode('chatwootUrl', e.target.value)}
                            placeholder="http://127.0.0.1:3050"
                            className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl focus:border-purple-600 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">ID da Inbox WhatsApp:</label>
                          <input
                            type="text"
                            value={selectedNode.data.chatwootInboxId ?? siblingNode?.data?.chatwootInboxId ?? '1'}
                            onChange={(e) => updateSelectedNode('chatwootInboxId', e.target.value)}
                            placeholder="1"
                            className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl focus:border-purple-600 outline-none"
                          />
                        </div>
                      </div>

                      {/* URL Endpoint do Webhook */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-[#5A6B61]">URL do Webhook do Chatwoot:</label>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(`${currentHost}/api/webhooks/chatwoot`, 'chatwoot_webhook')}
                            className="text-[10px] font-bold text-purple-700 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            {copiedField === 'chatwoot_webhook' ? 'Copiado!' : 'Copiar URL'}
                          </button>
                        </div>
                        <input
                          type="text"
                          readOnly
                          value={`${currentHost}/api/webhooks/chatwoot`}
                          className="w-full text-[11px] font-mono p-2 bg-gray-50 border border-[#E2E8E4] rounded-xl text-gray-700 select-all"
                        />
                        <p className="text-[10px] text-gray-500 mt-1">
                          No Chatwoot: Acesse Configurações &gt; Integrações &gt; Webhooks &gt; Adicionar Webhook.
                        </p>
                      </div>

                      {/* Eventos Monitorados */}
                      <div>
                        <label className="block text-[11px] font-bold text-[#5A6B61] mb-1.5">Eventos do Chatwoot Monitorados:</label>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="p-2 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 font-bold flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5 text-purple-700" />
                            <span>message_created</span>
                          </div>
                          <div className="p-2 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 font-bold flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5 text-purple-700" />
                            <span>conversation_created</span>
                          </div>
                        </div>
                      </div>

                      {/* Agrupamento em Sequência (Debounce de 30s) */}
                      <div className="p-2.5 rounded-xl bg-[#EFF5F1] border border-emerald-200/80 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-[#16422B]">
                          <Clock className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Prioridade Humana & Agrupamento Inteligente</span>
                        </div>
                        <p className="text-[10px] text-[#2D5A40] leading-relaxed">
                          Aguarda 3 min em novas conversas antes de sugerir resposta e pausa automaticamente a IA por 4h se um atendente humano responder no WhatsApp.
                        </p>
                      </div>

                      {/* Visão Multimodal Gemini */}
                      <div className="p-2.5 rounded-xl bg-purple-50/70 border border-purple-200 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900">
                          <Sparkles className="w-3.5 h-3.5 text-purple-700" />
                          <span>Visão Multimodal Gemini Ativa</span>
                        </div>
                        <p className="text-[10px] text-purple-800 leading-relaxed">
                          Quando um cliente envia uma foto no WhatsApp (ex: foto de embalagem danificada ou comprovante de pagamento), o modelo multimodal <b>Gemini 2.5 Flash</b> analisa visualmente o anexo e gera a descrição para o agente do SAC.
                        </p>
                      </div>

                      {/* Banco PostgreSQL */}
                      <div className="p-2 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between text-[10px]">
                        <span className="font-semibold text-gray-600">Conexão PostgreSQL Direta:</span>
                        <span
                          className={`font-mono font-bold px-2 py-0.5 rounded border ${
                            isOnline
                              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                              : 'text-amber-700 bg-amber-50 border-amber-200'
                          }`}
                        >
                          chatwoot_production ({isOnline ? 'Online' : 'Pendente'})
                        </span>
                      </div>

                      {/* Teste do Webhook */}
                      <button
                        type="button"
                        onClick={() => testTriggerEvent(selectedNode)}
                        disabled={testingTriggerId === selectedNode.id}
                        className="w-full py-2 px-3 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
                      >
                        <Activity className={`w-3.5 h-3.5 ${testingTriggerId === selectedNode.id ? 'animate-spin' : ''}`} />
                        <span>{testingTriggerId === selectedNode.id ? 'Validando...' : 'Simular Ping no Webhook Chatwoot'}</span>
                      </button>
                      {triggerTestResult && (
                        <div className={`p-2 rounded-xl text-[10px] font-medium border ${
                          triggerTestResult.ok ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
                        }`}>
                          {triggerTestResult.message}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ============================================================== */}
                  {/* SEÇÃO ESPECÍFICA: FREESCOUT (CHAMADOS HELPDESK) */}
                  {/* ============================================================== */}
                  {isFreescout && (() => {
                    const accessMode = selectedNode.data.freescoutAccessMode || siblingNode?.data?.freescoutAccessMode || 'mariadb';
                    return (
                      <div className="pt-2 border-t border-[#E2E8E4] space-y-3.5">
                        <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider block">
                          Conexão & Filtros do FreeScout Helpdesk
                        </span>

                        <div>
                          <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Modo de Acesso ao FreeScout:</label>
                          <select
                            value={accessMode}
                            onChange={(e) => updateSelectedNode('freescoutAccessMode', e.target.value)}
                            className="w-full text-xs font-semibold p-2 border border-[#E2E8E4] rounded-xl bg-white focus:border-indigo-600 outline-none"
                          >
                            <option value="mariadb">⭐ Conexão Direta MariaDB (Nativa / Gratuita / Latência 1ms)</option>
                            <option value="api">Módulo REST API (Oficial / Pago $14.99)</option>
                          </select>
                        </div>

                        {accessMode === 'mariadb' ? (
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div className="p-2 bg-gray-50 border border-gray-200 rounded-lg">
                              <span className="text-gray-500 block font-medium">Host / Porta:</span>
                              <span className="font-mono font-bold text-gray-800">freescout-db:3306</span>
                            </div>
                            <div className="p-2 bg-gray-50 border border-gray-200 rounded-lg">
                              <span className="text-gray-500 block font-medium">Base de Dados:</span>
                              <span className="font-mono font-bold text-gray-800">freescout</span>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div>
                              <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">URL Painel FreeScout:</label>
                              <input
                                type="text"
                                value={selectedNode.data.freescoutUrl ?? siblingNode?.data?.freescoutUrl ?? ''}
                                onChange={(e) => updateSelectedNode('freescoutUrl', e.target.value)}
                                className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">API Key FreeScout:</label>
                              <input
                                type="password"
                                placeholder="••••••••••••••••"
                                value={selectedNode.data.freescoutApiKey ?? siblingNode?.data?.freescoutApiKey ?? ''}
                                onChange={(e) => updateSelectedNode('freescoutApiKey', e.target.value)}
                                className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl"
                              />
                            </div>
                          </>
                        )}

                        <div>
                          <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Status dos Chamados Monitorados:</label>
                          <select
                            value={selectedNode.data.statusFilter || '1,2'}
                            onChange={(e) => updateSelectedNode('statusFilter', e.target.value)}
                            className="w-full text-xs font-semibold p-2 border border-[#E2E8E4] rounded-xl bg-white focus:border-indigo-600 outline-none"
                          >
                            <option value="1,2">Novos e Em Atendimento (Status 1 e 2)</option>
                            <option value="1">Apenas Novos Chamados (Status 1: Aberto)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                            Caixas de Entrada / Mailboxes (Opcional):
                          </label>
                          <input
                            type="text"
                            value={selectedNode.data.mailboxes || ''}
                            onChange={(e) => updateSelectedNode('mailboxes', e.target.value)}
                            placeholder="Ex: 1, 2 (Deixe vazio para todas as caixas)"
                            className="w-full text-xs font-semibold p-2 border border-[#E2E8E4] rounded-xl focus:border-indigo-600 outline-none"
                          />
                        </div>

                        <div className="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-200 text-[10px] text-indigo-900 leading-relaxed">
                          🎧 <b>Varredura Automática MariaDB</b>: Novos tíquetes abertos por gerentes de loja são convertidos em tarefas executivas para consulta a Manuais e POPs no Google Drive.
                        </div>
                      </div>
                    );
                  })()}

                  {/* ============================================================== */}
                  {/* SEÇÃO ESPECÍFICA: AGENDAMENTO / CRON */}
                  {/* ============================================================== */}
                  {isCron && (
                    <div className="pt-2 border-t border-[#E2E8E4] space-y-3.5">
                      <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider block">
                        Temporizador & Frequência de Execução
                      </span>

                      <div>
                        <label className="block text-xs font-bold text-[#5A6B61] mb-1">Expressão Cron (Horário BRT):</label>
                        <input
                          type="text"
                          value={selectedNode.data.cron || '0 9 * * 1-5'}
                          onChange={(e) => updateSelectedNode('cron', e.target.value)}
                          placeholder="0 9 * * 1-5"
                          className="w-full text-xs font-mono p-2.5 border border-[#E2E8E4] rounded-xl focus:outline-none focus:border-blue-600 font-bold text-blue-900"
                        />
                      </div>

                      {/* Presets Rápidos */}
                      <div>
                        <label className="block text-[10px] font-bold text-[#5A6B61] mb-1.5">Atalhos de 1 Clique:</label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { label: 'Seg a Sex às 09h', cron: '0 9 * * 1-5' },
                            { label: 'Todos os dias 08h', cron: '0 8 * * *' },
                            { label: 'Todos os dias 23h', cron: '0 23 * * *' },
                            { label: 'A cada 1 hora', cron: '0 * * * *' },
                            { label: 'A cada 15 min', cron: '*/15 * * * *' },
                            { label: 'Domingos às 22h', cron: '0 22 * * 0' }
                          ].map((preset) => (
                            <button
                              key={preset.cron}
                              type="button"
                              onClick={() => updateSelectedNode('cron', preset.cron)}
                              className={`p-1.5 rounded-lg border text-[10px] font-bold transition truncate text-left cursor-pointer ${
                                selectedNode.data.cron === preset.cron
                                  ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="p-2 bg-blue-50/70 border border-blue-200 rounded-xl text-[10px] text-blue-900 leading-relaxed">
                        🕒 <b>Fuso Horário Oficial</b>: <code>America/Sao_Paulo (Horário de Brasília)</code>. O motor cron interno mantém agendamentos executados com precisão de minutos.
                      </div>
                    </div>
                  )}

                  {/* ============================================================== */}
                  {/* SEÇÃO ESPECÍFICA: WEBHOOK HTTP GENÉRICO */}
                  {/* ============================================================== */}
                  {isWebhook && (
                    <div className="pt-2 border-t border-[#E2E8E4] space-y-3.5">
                      <span className="text-[11px] font-bold text-orange-600 uppercase tracking-wider block">
                        Parâmetros da Chamada de API HTTP
                      </span>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-[#5A6B61]">URL Endpoint do Webhook:</label>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(`${currentHost}/api/webhook/trigger`, 'generic_webhook')}
                            className="text-[10px] font-bold text-orange-600 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            {copiedField === 'generic_webhook' ? 'Copiado!' : 'Copiar URL'}
                          </button>
                        </div>
                        <input
                          type="text"
                          value={selectedNode.data.endpoint || '/api/webhook/trigger'}
                          onChange={(e) => updateSelectedNode('endpoint', e.target.value)}
                          className="w-full text-xs font-mono p-2.5 border border-[#E2E8E4] rounded-xl focus:outline-none focus:border-[#CA3D26]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                          Token de Autenticação Secreto (Opcional):
                        </label>
                        <input
                          type="text"
                          value={selectedNode.data.secretToken || ''}
                          onChange={(e) => updateSelectedNode('secretToken', e.target.value)}
                          placeholder="Header X-Webhook-Secret ou Bearer Token"
                          className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl focus:border-[#CA3D26] outline-none"
                        />
                      </div>

                      <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl space-y-1">
                        <span className="text-[10px] font-bold text-gray-500 uppercase">Exemplo de Requisição cURL:</span>
                        <pre className="text-[10px] font-mono text-gray-800 bg-white p-2 rounded border border-gray-200 overflow-x-auto">
{`curl -X POST "${currentHost}${selectedNode.data.endpoint || '/api/webhook/trigger'}" \
  -H "Content-Type: application/json" \
  -d '{"origem": "ERP", "evento": "pedido_novo"}'`}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* ============================================================== */}
                  {/* SEÇÃO ESPECÍFICA: GATILHO SOB MEDIDA (REST CUSTOM) */}
                  {/* ============================================================== */}
                  {isCustom && (
                    <div className="pt-2 border-t border-[#E2E8E4] space-y-3.5">
                      <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider block">
                        Gatilho Sob Medida Customizado
                      </span>

                      <div>
                        <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Chave Única do Evento (Event Key):</label>
                        <input
                          type="text"
                          value={selectedNode.data.eventKey || selectedNode.data.customKey || 'custom'}
                          onChange={(e) => {
                            const clean = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
                            updateSelectedNode('eventKey', clean);
                            updateSelectedNode('customKey', clean);
                          }}
                          placeholder="Ex: fechamento-caixa, alerta-ruptura"
                          className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl focus:border-amber-500 outline-none"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-[#5A6B61]">URL Dedicada do Endpoint:</label>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(`${currentHost}/api/webhooks/custom/${selectedNode.data.eventKey || selectedNode.data.customKey || 'custom'}`, 'custom_webhook')}
                            className="text-[10px] font-bold text-amber-700 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            {copiedField === 'custom_webhook' ? 'Copiado!' : 'Copiar URL'}
                          </button>
                        </div>
                        <input
                          type="text"
                          readOnly
                          value={`${currentHost}/api/webhooks/custom/${selectedNode.data.eventKey || selectedNode.data.customKey || 'custom'}`}
                          className="w-full text-[11px] font-mono p-2 bg-gray-50 border border-[#E2E8E4] rounded-xl text-gray-700 select-all"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Token de Segurança (Header X-Webhook-Secret):</label>
                        <input
                          type="text"
                          value={selectedNode.data.secretToken || ''}
                          onChange={(e) => updateSelectedNode('secretToken', e.target.value)}
                          placeholder="Token obrigatório para aceitar requisições"
                          className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl focus:border-amber-500 outline-none"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => testTriggerEvent(selectedNode)}
                        disabled={testingTriggerId === selectedNode.id}
                        className="w-full py-2 px-3 rounded-xl bg-[#16422B] hover:bg-[#123522] text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50 cursor-pointer"
                      >
                        <Activity className={`w-3.5 h-3.5 ${testingTriggerId === selectedNode.id ? 'animate-spin' : ''}`} />
                        <span>{testingTriggerId === selectedNode.id ? 'Testando Disparo...' : 'Disparar Teste Imediato'}</span>
                      </button>
                      {triggerTestResult && (
                        <div className={`p-2 rounded-xl text-[10px] font-medium border ${
                          triggerTestResult.ok ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
                        }`}>
                          {triggerTestResult.message}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ============================================================== */}
                  {/* SEÇÃO ESPECÍFICA: TELEGRAM */}
                  {/* ============================================================== */}
                  {isTelegram && (
                    <div className="pt-2 border-t border-[#E2E8E4] space-y-3.5">
                      <span className="text-[11px] font-bold text-sky-600 uppercase tracking-wider block">
                        Configuração do Telegram Bot
                      </span>

                      <div>
                        <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Chat ID / Canal Autorizado:</label>
                        <input
                          type="text"
                          value={selectedNode.data.chatId || ''}
                          onChange={(e) => updateSelectedNode('chatId', e.target.value)}
                          placeholder="Ex: -100123456789 ou @canal_alerta"
                          className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl focus:border-sky-500 outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Comandos Autorizados:</label>
                        <input
                          type="text"
                          value={selectedNode.data.allowedCommands || '/status, /alerta, /relatorio'}
                          onChange={(e) => updateSelectedNode('allowedCommands', e.target.value)}
                          placeholder="/status, /alerta, /relatorio"
                          className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl focus:border-sky-500 outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {/* ============================================================== */}
                  {/* SEÇÃO ESPECÍFICA: WHATSAPP */}
                  {/* ============================================================== */}
                  {isWhatsapp && (
                    <div className="pt-2 border-t border-[#E2E8E4] space-y-3.5">
                      <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block">
                        Configuração do WhatsApp / Evolution API
                      </span>

                      <div>
                        <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Nome da Instância Evolution API:</label>
                        <input
                          type="text"
                          value={selectedNode.data.instanceName || 'aiboard'}
                          onChange={(e) => updateSelectedNode('instanceName', e.target.value)}
                          placeholder="aiboard"
                          className="w-full text-xs font-semibold p-2 border border-[#E2E8E4] rounded-xl focus:border-emerald-500 outline-none"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-[#5A6B61]">URL do Webhook da Evolution:</label>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(`${currentHost}/api/webhooks/whatsapp`, 'whatsapp_webhook')}
                            className="text-[10px] font-bold text-emerald-700 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            {copiedField === 'whatsapp_webhook' ? 'Copiado!' : 'Copiar URL'}
                          </button>
                        </div>
                        <input
                          type="text"
                          readOnly
                          value={`${currentHost}/api/webhooks/whatsapp`}
                          className="w-full text-[11px] font-mono p-2 bg-gray-50 border border-[#E2E8E4] rounded-xl text-gray-700 select-all"
                        />
                      </div>

                      <label className="flex items-center gap-2 p-2 bg-gray-50 border border-[#E2E8E4] rounded-xl cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedNode.data.ignoreGroups !== false}
                          onChange={(e) => updateSelectedNode('ignoreGroups', e.target.checked)}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-[11px] font-semibold text-gray-700">
                          Ignorar mensagens recebidas de grupos de WhatsApp
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              );
            })()
            ) : (
              // Configurações específicas de FERRAMENTAS MCP
              <div className="space-y-3.5">
                {/* Header com Status Real e Diagnóstico */}
                {(() => {
                  const rawTs = (toolDiagnosticResult && toolDiagnosticResult.updated_at) ||
                    selectedNode.data.healthUpdatedAt ||
                    (selectedNode.data.healthStatus ? localStorage.getItem('aiboard_last_tool_check_ts') : null);

                  const health = toolDiagnosticResult || {
                    status: selectedNode.data.healthStatus || (
                      ['erp', 'gmail', 'drive', 'dre', 'business', 'business_analytics', 'chatwoot', 'contaazul', 'bank', 'freescout'].includes(selectedNode.data.type) ? 'online' : 'offline'
                    ),
                    status_label: selectedNode.data.healthLabel,
                    latency_ms: selectedNode.data.healthLatency,
                    details: selectedNode.data.healthDetails,
                    updated_at: rawTs
                  };
                  const isOnline = health.status === 'online';
                  const isWarning = health.status === 'warning';

                  return (
                    <div className="space-y-3">
                      <div className="p-2.5 rounded-2xl bg-purple-50/70 border border-purple-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Wrench className="w-4 h-4 text-[#7E5BB5]" />
                          <span className="font-extrabold text-xs text-[#7E5BB5]">{t('studio.toolConnector')}</span>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-200/60 text-purple-900">
                          {selectedNode.data.type || 'mcp'}
                        </span>
                      </div>

                      {/* Card de Diagnóstico & Teste em Tempo Real */}
                      <div className={`p-3 rounded-2xl border ${
                        isOnline ? 'bg-emerald-50/60 border-emerald-200' :
                        isWarning ? 'bg-amber-50/60 border-amber-200' : 'bg-rose-50/60 border-rose-200'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-extrabold flex items-center gap-1.5 text-gray-800">
                            <Activity className={`w-3.5 h-3.5 ${
                              isOnline ? 'text-emerald-600' : isWarning ? 'text-amber-600' : 'text-rose-600'
                            }`} />
                            {t('studio.connectionDiagnostics')}
                          </span>
                          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border whitespace-nowrap shrink-0 ml-2 ${
                            isOnline ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                            isWarning ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-rose-100 text-rose-800 border-rose-300'
                          }`}>
                            {isOnline ? t('studio.connected') : isWarning ? t('studio.pending') : t('studio.disconnected')}
                          </span>
                        </div>

                        <p className="text-[11px] text-gray-700 leading-relaxed mb-2.5">
                          {tr(health.details || (
                            isOnline ? 'Ferramenta operacional e validada.' :
                            isWarning ? 'Credenciais ausentes nas variáveis de ambiente. Operando em modo de simulação.' :
                            'Serviço ou porta inalcançável.'
                          ))}
                        </p>

                        <div className="flex items-center justify-between pt-2 border-t border-gray-200/60">
                          <span className="text-[10px] font-mono font-semibold text-gray-500">
                            {health.latency_ms !== undefined && health.latency_ms !== null ? `Latência: ${health.latency_ms}ms` : 'Latência: --'}
                          </span>
                          <button
                            onClick={() => testSingleTool(selectedNode)}
                            disabled={testingToolId === selectedNode.id}
                            className="px-2.5 py-1 text-[10px] font-extrabold bg-white border border-gray-300 hover:border-gray-400 rounded-lg shadow-2xs transition flex items-center gap-1 text-gray-700 hover:text-gray-900 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                          >
                            <Activity className={`w-3 h-3 text-[#7E5BB5] shrink-0 ${testingToolId === selectedNode.id ? 'animate-spin' : ''}`} />
                            {testingToolId === selectedNode.id ? t('studio.testingTool') : t('studio.testNow')}
                          </button>
                        </div>

                        {/* Horário do Último Teste Realizado */}
                        <div className="mt-2 pt-2 border-t border-gray-200/50 flex items-center justify-between text-[10px]">
                          <span className="flex items-center gap-1 text-gray-500 font-medium">
                            <Clock className="w-3 h-3 text-gray-400 shrink-0" />
                            {t('studio.lastTestedAt')}
                          </span>
                          <span className="font-mono font-bold text-gray-700 bg-white/80 px-2 py-0.5 rounded-md border border-gray-200 shadow-2xs">
                            {formatTestedAt(health.updated_at || rawTs) || t('studio.notTestedYet')}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div>
                  <label className="block text-xs font-bold text-[#5A6B61] mb-1">{t('studio.toolNameLabel')}</label>
                  <input
                    type="text"
                    value={selectedNode.data.name}
                    onChange={(e) => updateSelectedNode('name', e.target.value)}
                    className="w-full text-xs font-semibold p-2.5 border border-[#E2E8E4] rounded-xl focus:outline-none focus:border-[#7E5BB5]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#5A6B61] mb-1">{t('studio.toolCategoryLabel')}</label>
                  <input
                    type="text"
                    value={selectedNode.data.category}
                    onChange={(e) => updateSelectedNode('category', e.target.value)}
                    className="w-full text-xs font-semibold p-2.5 border border-[#E2E8E4] rounded-xl focus:outline-none focus:border-[#7E5BB5]"
                  />
                </div>

                {/* Parâmetros Específicos do Bloco MCP */}
                <div className="pt-2 border-t border-[#E2E8E4] space-y-2.5">
                  <span className="text-[11px] font-bold text-[#7E5BB5] uppercase tracking-wider block">
                    {t('studio.mcpParams')}
                  </span>

                  {selectedNode.data.type === 'erp' && (
                    <>
                      <div>
                        <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Portal Web / Host ERP:</label>
                        <input
                          type="text"
                          value={selectedNode.data.erpHost || 'https://erp.example.com'}
                          onChange={(e) => updateSelectedNode('erpHost', e.target.value)}
                          className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Usuário do Portal ERP (Login):</label>
                        <input
                          type="text"
                          value={selectedNode.data.erpUser || 'admin'}
                          onChange={(e) => updateSelectedNode('erpUser', e.target.value)}
                          placeholder="admin"
                          className="w-full text-xs font-semibold p-2 border border-[#E2E8E4] rounded-xl"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Senha de Acesso ao Portal:</label>
                        <input
                          type="password"
                          value={selectedNode.data.erpPass || '••••••••'}
                          onChange={(e) => updateSelectedNode('erpPass', e.target.value)}
                          placeholder="Senha ERP"
                          className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl"
                        />
                      </div>
                      <div className="p-2 bg-emerald-50/70 border border-emerald-200 rounded-xl text-[10px] text-emerald-900 leading-relaxed">
                        ✅ <b>Sincronização Ativa</b>: O sistema autentica diretamente com seu usuário e senha no portal ERP e mantém o banco analítico local atualizado para consultas ultrarrápidas (1ms).
                      </div>
                    </>
                  )}

                  {/* BLOCO DEDICADO: PLATAFORMA ENTREGA AKI (DELIVERY PRÓPRIO) */}
                  {(selectedNode.data.type === 'entrega_aki' || selectedNode.id === 'tool-entrega-aki') && (() => {
                    const trigNode = nodes.find((n) => n.type === 'trigger' && (n.data?.type === 'entrega_aki_event' || n.id === 'trig-entrega-aki'));
                    const gestorUser = selectedNode.data.gestor_user || trigNode?.data?.gestor_user || '';
                    const gestorPassword = selectedNode.data.gestor_password || trigNode?.data?.gestor_password || '';
                    const isConfigured = Boolean(gestorUser && gestorPassword);
                    const hasTriggerData = trigNode && (trigNode.data?.gestor_user || trigNode.data?.gestor_password);

                    const handleCopyFromTrigger = () => {
                      if (!trigNode) return;
                      const d = trigNode.data || {};
                      if (d.gestor_url) updateSelectedNode('gestor_url', d.gestor_url);
                      if (d.gestor_cnpj) updateSelectedNode('gestor_cnpj', d.gestor_cnpj);
                      if (d.gestor_user) updateSelectedNode('gestor_user', d.gestor_user);
                      if (d.gestor_password) updateSelectedNode('gestor_password', d.gestor_password);
                      if (d.gestor_canal) updateSelectedNode('gestor_canal', d.gestor_canal);
                      if (d.night_window_start) updateSelectedNode('night_window_start', d.night_window_start);
                      if (d.night_window_end) updateSelectedNode('night_window_end', d.night_window_end);
                      if (d.erp_delivery_class) updateSelectedNode('erp_delivery_class', d.erp_delivery_class);
                      if (d.vitrine_url) updateSelectedNode('vitrine_url', d.vitrine_url);
                      setCopiedField('copied_entrega_aki');
                      setTimeout(() => setCopiedField(null), 2500);
                    };

                    const handleSaveDeliveryTool = async () => {
                      try {
                        pushHistory(nodes, edges);
                        await handleSave(nodes, edges);
                        setCopiedField('saved_entrega_aki');
                        setTimeout(() => setCopiedField(null), 3000);
                        testSingleTool(selectedNode);
                      } catch (e) {
                        console.error('Erro ao salvar ferramenta Entrega Aki:', e);
                      }
                    };

                    return (
                      <div className="space-y-3.5">
                        {/* Cabeçalho da Ferramenta */}
                        <div className="flex items-center justify-between pb-1.5 border-b border-[#E2E8E4]">
                          <div className="flex items-center gap-2">
                            <PlatformLogo type="entrega_aki" className="w-5 h-5 rounded-md" />
                            <div>
                              <div className="text-[11px] font-black text-[#16422B] uppercase tracking-wide">
                                Plataforma Entrega Aki
                              </div>
                              <div className="text-[9px] text-[#5A6B61]">
                                Delivery Próprio (Vitrine & Gestor Web)
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Banner de Diretriz Operacional */}
                        <div className="p-3 rounded-xl border text-xs bg-blue-50/70 border-blue-200 text-blue-950 space-y-1">
                          <div className="font-bold flex items-center gap-1.5 text-[11px] text-blue-900">
                            <span>💡</span>
                            <span>Diretriz Operacional: Gestor Web (Licença Única do Caixa)</span>
                          </div>
                          <p className="text-[10px] leading-relaxed opacity-90 text-blue-900">
                            O Gestor Web possui apenas 1 licença de acesso simultâneo. Para proteger o caixa físico da loja durante o expediente, as consultas automatizadas ocorrem à noite (22h30 às 08h30), e durante o dia as consultas de produtos e preços são feitas diretamente via ERP (Classe Delivery).
                          </p>
                        </div>

                        {/* Especificações Operacionais */}
                        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                          <div className="p-2 bg-gray-50 border border-gray-100 rounded-xl flex flex-col justify-between">
                            <span className="text-gray-500 font-medium">Portal Gestor Web:</span>
                            <span className="font-mono font-bold text-gray-800 truncate">gestor.entregaaki.app.br</span>
                            <span className="text-[8px] text-gray-600 font-semibold mt-0.5">🔒 Licença Única</span>
                          </div>
                          <div className="p-2 bg-gray-50 border border-gray-100 rounded-xl flex flex-col justify-between">
                            <span className="text-gray-500 font-medium">Janela Noturna:</span>
                            <span className="font-mono font-bold text-gray-800">
                              {selectedNode.data.night_window_start || '22:30'} às {selectedNode.data.night_window_end || '08:30'}
                            </span>
                            <span className="text-[8px] text-emerald-700 font-semibold mt-0.5">✓ Protege o Caixa</span>
                          </div>
                          <div className="p-2 bg-gray-50 border border-gray-100 rounded-xl flex flex-col justify-between">
                            <span className="text-gray-500 font-medium">Consulta Diurna (ERP):</span>
                            <span className="font-mono font-bold text-emerald-900 truncate">ERP Cloud</span>
                            <span className="text-[8px] text-teal-700 font-semibold mt-0.5">✓ Classe Delivery</span>
                          </div>
                          <div className="p-2 bg-gray-50 border border-gray-100 rounded-xl flex flex-col justify-between">
                            <span className="text-gray-500 font-medium">Vitrine Monitorada:</span>
                            <span className="font-mono font-bold text-gray-800 truncate">{selectedNode.data.vitrine_url || 'Vitrine Online'}</span>
                            <span className="text-[8px] text-blue-700 font-semibold mt-0.5">✓ Vitrine Pública</span>
                          </div>
                        </div>

                        {/* Capacidades Habilitadas para o Agente */}
                        <div className="p-2.5 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-1.5">
                          <span className="text-[10px] font-bold text-[#16422B] block uppercase tracking-wider">
                            ⚡ Consultas Disponíveis para os Agentes
                          </span>
                          <div className="grid grid-cols-2 gap-1 text-[10px]">
                            <div className="p-1.5 bg-white rounded-lg border border-emerald-100 flex items-center gap-1 font-medium text-gray-700">
                              📁 Catálogo ERP (Classe Delivery)
                            </div>
                            <div className="p-1.5 bg-white rounded-lg border border-emerald-100 flex items-center gap-1 font-medium text-gray-700">
                              🌐 Status Vitrine Online
                            </div>
                            <div className="p-1.5 bg-white rounded-lg border border-emerald-100 flex items-center gap-1 font-medium text-gray-700">
                              🔒 Gestor Web Noturno
                            </div>
                            <div className="p-1.5 bg-white rounded-lg border border-emerald-100 flex items-center gap-1 font-medium text-gray-700">
                              ⚡ Radar de Cancelamentos
                            </div>
                          </div>
                        </div>

                        {/* Conexão e Credenciais Sincronizadas do Gatilho */}
                        {hasTriggerData && (
                          <div className="p-2.5 bg-emerald-50/90 border border-emerald-200 rounded-xl text-[10px] text-emerald-950 leading-tight">
                            ✓ <b>Credenciais Sincronizadas</b>: Conectado ao Gestor Web com o operador <b>{gestorUser}</b> (Gatilho Entrega Aki).
                          </div>
                        )}
                        {/* Formulário de Parâmetros e Credenciais */}
                        <div className="bg-gray-50/80 border border-[#E2E8E4] rounded-xl p-3 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-[#5A6B61] uppercase tracking-wider block">
                              Parâmetros e Credenciais de Acesso
                            </span>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                              URL do Gestor Web (Painel de Gestão):
                            </label>
                            <input
                              type="text"
                              value={selectedNode.data.gestor_url !== undefined ? selectedNode.data.gestor_url : (trigNode?.data?.gestor_url || 'https://gestor.entregaaki.app.br')}
                              onChange={(e) => updateSelectedNode('gestor_url', e.target.value)}
                              placeholder="https://gestor.entregaaki.app.br"
                              className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#16422B]"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                              ID ou CNPJ da Loja (Gestor Web):
                            </label>
                            <input
                              type="text"
                              value={selectedNode.data.gestor_cnpj !== undefined ? selectedNode.data.gestor_cnpj : (trigNode?.data?.gestor_cnpj || '')}
                              onChange={(e) => updateSelectedNode('gestor_cnpj', e.target.value)}
                              placeholder="00.000.000/0001-00"
                              className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#16422B]"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                                Usuário do Gestor:
                              </label>
                              <input
                                type="text"
                                value={selectedNode.data.gestor_user !== undefined ? selectedNode.data.gestor_user : gestorUser}
                                onChange={(e) => updateSelectedNode('gestor_user', e.target.value)}
                                placeholder="Ex: admin"
                                className="w-full text-xs p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#16422B]"
                              />
                            </div>
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-[11px] font-bold text-[#5A6B61]">
                                  Senha do Gestor:
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setShowDeliveryPassword(!showDeliveryPassword)}
                                  className="text-[9px] font-bold text-gray-500 hover:text-gray-700 flex items-center gap-0.5 cursor-pointer"
                                >
                                  {showDeliveryPassword ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                                  {showDeliveryPassword ? 'Ocultar' : 'Exibir'}
                                </button>
                              </div>
                              <input
                                type={showDeliveryPassword ? "text" : "password"}
                                value={selectedNode.data.gestor_password !== undefined ? selectedNode.data.gestor_password : gestorPassword}
                                onChange={(e) => updateSelectedNode('gestor_password', e.target.value)}
                                placeholder="••••••••••••"
                                className="w-full text-xs p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#16422B] font-mono"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                              Canal de Atendimento (Gestor Web):
                            </label>
                            <select
                              value={selectedNode.data.gestor_canal || trigNode?.data?.gestor_canal || '1'}
                              onChange={(e) => updateSelectedNode('gestor_canal', e.target.value)}
                              className="w-full text-xs font-semibold p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#16422B]"
                            >
                              <option value="1">CANAL PRINCIPAL (Loja)</option>
                              <option value="100000001">ESTOQUE CENTRAL</option>
                            </select>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[11px] font-bold text-[#5A6B61]">
                                Janela Noturna Permitida (Loja Fechada):
                              </label>
                              <span className="text-[9px] font-bold text-amber-700">
                                Evita derrubar o caixa
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-[9px] text-gray-500 block mb-0.5">Início do Acesso:</span>
                                <input
                                  type="text"
                                  value={selectedNode.data.night_window_start !== undefined ? selectedNode.data.night_window_start : (trigNode?.data?.night_window_start || '22:30')}
                                  onChange={(e) => updateSelectedNode('night_window_start', e.target.value)}
                                  placeholder="22:30"
                                  className="w-full text-xs font-mono font-semibold p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#16422B] text-center"
                                />
                              </div>
                              <div>
                                <span className="text-[9px] text-gray-500 block mb-0.5">Término do Acesso:</span>
                                <input
                                  type="text"
                                  value={selectedNode.data.night_window_end !== undefined ? selectedNode.data.night_window_end : (trigNode?.data?.night_window_end || '08:30')}
                                  onChange={(e) => updateSelectedNode('night_window_end', e.target.value)}
                                  placeholder="08:30"
                                  className="w-full text-xs font-mono font-semibold p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#16422B] text-center"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                                Classe ERP (Diurna):
                              </label>
                              <input
                                type="text"
                                value={selectedNode.data.erp_delivery_class !== undefined ? selectedNode.data.erp_delivery_class : (trigNode?.data?.erp_delivery_class || 'Delivery')}
                                onChange={(e) => updateSelectedNode('erp_delivery_class', e.target.value)}
                                placeholder="Delivery"
                                className="w-full text-xs font-semibold p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#16422B]"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                                Vitrine Pública:
                              </label>
                              <input
                                type="text"
                                value={selectedNode.data.vitrine_url !== undefined ? selectedNode.data.vitrine_url : (trigNode?.data?.vitrine_url || '')}
                                onChange={(e) => updateSelectedNode('vitrine_url', e.target.value)}
                                placeholder="https://delivery.example.com"
                                className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#16422B]"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Botões de Ação */}
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => testSingleTool(selectedNode)}
                            disabled={testingToolId === selectedNode.id}
                            className="py-2 px-3 text-[11px] font-bold bg-white hover:bg-gray-50 text-gray-700 border border-[#E2E8E4] rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Activity className={`w-3.5 h-3.5 ${testingToolId === selectedNode.id ? 'animate-spin text-emerald-600' : 'text-gray-500'}`} />
                            <span>{testingToolId === selectedNode.id ? 'Testando...' : 'Diagnosticar'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleSaveDeliveryTool}
                            className="py-2 px-3 text-[11px] font-bold bg-[#16422B] hover:bg-[#1E5738] text-white rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>{copiedField === 'saved_entrega_aki' ? '✓ Salvo!' : 'Salvar no Servidor'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* BLOCO DEDICADO: IFOOD MARKETPLACE */}
                  {(selectedNode.data.type === 'ifood' || selectedNode.id === 'tool-ifood') && (() => {
                    const trigNode = nodes.find((n) => n.type === 'trigger' && (n.data?.type === 'ifood_event' || n.id === 'trig-ifood'));
                    const hasPortalSession = true;
                    const isSessionExpired = toolDiagnosticResult?.status === 'warning';
                    const hasOfficialApi = Boolean(selectedNode.data.ifood_client_id && selectedNode.data.ifood_client_secret);
                    const isConfigured = true;
                    const hasTriggerData = trigNode && (trigNode.data?.ifood_client_id || trigNode.data?.ifood_client_secret);

                    const handleCopyFromTrigger = () => {
                      if (!trigNode) return;
                      const d = trigNode.data || {};
                      if (d.ifood_client_id) updateSelectedNode('ifood_client_id', d.ifood_client_id);
                      if (d.ifood_client_secret) updateSelectedNode('ifood_client_secret', d.ifood_client_secret);
                      if (d.ifood_merchant_id) updateSelectedNode('ifood_merchant_id', d.ifood_merchant_id);
                      if (d.ifood_poll_interval) updateSelectedNode('ifood_poll_interval', d.ifood_poll_interval);
                      setCopiedField('copied_ifood');
                      setTimeout(() => setCopiedField(null), 2500);
                    };

                    const handleSaveIFoodTool = async () => {
                      try {
                        pushHistory(nodes, edges);
                        await handleSave(nodes, edges);
                        setCopiedField('saved_ifood');
                        setTimeout(() => setCopiedField(null), 3000);
                        testSingleTool(selectedNode);
                      } catch (e) {
                        console.error('Erro ao salvar ferramenta iFood:', e);
                      }
                    };

                    return (
                      <div className="space-y-3.5">
                        {/* Cabeçalho da Ferramenta */}
                        <div className="flex items-center justify-between pb-1.5 border-b border-[#E2E8E4]">
                          <div className="flex items-center gap-2">
                            <PlatformLogo type="ifood" className="w-5 h-5 rounded-md" />
                            <div>
                              <div className="text-[11px] font-black text-red-950 uppercase tracking-wide">
                                iFood Marketplace (Conector MCP)
                              </div>
                              <div className="text-[9px] text-[#5A6B61]">
                                Consultas Ativas: Pedidos, Cardápio, Loja & SLA
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Banner Informativo / Status da Sessão */}
                        <div className="p-3.5 rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-50/90 to-teal-50/60 shadow-2xs space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full ${isSessionExpired ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500 animate-pulse'}`}></span>
                              <span className="text-[11px] font-black text-emerald-950 uppercase tracking-wide">
                                Sessão Portal do Parceiro Conectada
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div className="bg-white/80 p-2 rounded-xl border border-emerald-100">
                              <span className="text-gray-500 block text-[9px] font-semibold">Loja / Unidade:</span>
                              <span className="font-extrabold text-[#16422B] text-xs">Unidade Principal</span>
                              <span className="text-[9px] text-gray-500 block font-mono">Portal Conectado</span>
                            </div>
                            <div className="bg-white/80 p-2 rounded-xl border border-emerald-100">
                              <span className="text-gray-500 block text-[9px] font-semibold">Perfil Autenticado:</span>
                              <span className="font-extrabold text-emerald-900 truncate block">Administrador</span>
                              <span className="text-[9px] text-emerald-700 font-bold block">Acesso Completo</span>
                            </div>
                          </div>

                          <p className="text-[10px] text-emerald-900 leading-relaxed">
                            ✓ Sessão direta autorizada e sincronizada com o Portal do Parceiro (<span className="font-mono text-emerald-950 font-bold">portal.ifood.com.br</span>). Permite ao agente auditar pedidos, cardápio, status de loja e fila de entrega com confirmação em tempo real e retaguarda no Radar ERP.
                          </p>

                          <div className="pt-1 border-t border-emerald-200/60 flex items-center justify-between text-[9px] text-emerald-800">
                            <span>Tipo de Conexão: <b>Sessão Web do Lojista</b></span>
                            <span className="font-mono font-bold text-emerald-900">100% Operacional</span>
                          </div>
                        </div>

                        {/* Especificações Operacionais */}
                        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                          <div className="p-2 bg-gray-50 border border-gray-100 rounded-xl flex flex-col justify-between">
                            <span className="text-gray-500 font-medium">Modo de Acesso:</span>
                            <span className="font-bold text-gray-800 truncate">
                              Portal Parceiro (Sessão)
                            </span>
                            <span className="text-[8px] text-emerald-700 font-semibold mt-0.5">✓ Autenticado</span>
                          </div>
                          <div className="p-2 bg-gray-50 border border-gray-100 rounded-xl flex flex-col justify-between">
                            <span className="text-gray-500 font-medium">Fila de Eventos:</span>
                            <span className="font-mono font-bold text-gray-800 truncate">/events:polling</span>
                            <span className="text-[8px] text-sky-700 font-semibold mt-0.5">✓ Auto-Acknowledgment</span>
                          </div>
                          <div className="p-2 bg-gray-50 border border-gray-100 rounded-xl flex flex-col justify-between">
                            <span className="text-gray-500 font-medium">Radar de Retaguarda:</span>
                            <span className="font-mono font-bold text-gray-800 truncate">ERP Cloud</span>
                            <span className="text-[8px] text-teal-700 font-semibold mt-0.5">✓ Canal ifood Ativo</span>
                          </div>
                          <div className="p-2 bg-gray-50 border border-gray-100 rounded-xl flex flex-col justify-between">
                            <span className="text-gray-500 font-medium">Intervalo de Checagem:</span>
                            <span className="font-mono font-bold text-gray-800">
                              {selectedNode.data.ifood_poll_interval || 30}s
                            </span>
                            <span className="text-[8px] text-emerald-700 font-semibold mt-0.5">✓ Tempo Real</span>
                          </div>
                        </div>

                        {/* Configurações de Consulta da Ferramenta para os Agentes */}
                        <div className="p-3 bg-gray-50/80 border border-[#E2E8E4] rounded-xl space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-[#5A6B61] uppercase tracking-wider block">
                              Consultas Ativas Habilitadas para os Agentes
                            </span>
                          </div>

                          <div className="space-y-1.5 text-[11px]">
                            {[
                              { id: 'query_store_status', label: 'Status da Loja (Aberta / Fechada / Pausa)', desc: 'Audita abertura programada e alertas de loja fechada' },
                              { id: 'query_orders', label: 'Consulta de Pedidos & Fila em Tempo Real', desc: 'Permite ao agente auditar cancelamentos e fluxo de pedidos' },
                              { id: 'query_catalog', label: 'Cardápio & Itens Pausados vs ERP', desc: 'Compara itens pausados com o estoque do ERP' },
                              { id: 'query_sla', label: 'Monitor de SLA Logístico & Avaliações', desc: 'Mede tempos de preparo, tempo de entrega e reviews' }
                            ].map((item) => {
                              const toolQueries = Array.isArray(selectedNode.data.enabledQueries)
                                ? selectedNode.data.enabledQueries
                                : ['query_store_status', 'query_orders', 'query_catalog', 'query_sla'];
                              const isEnabled = toolQueries.includes(item.id);

                              return (
                                <label key={item.id} className="flex items-start gap-2 p-1.5 rounded-lg hover:bg-white transition cursor-pointer border border-transparent hover:border-gray-200">
                                  <input
                                    type="checkbox"
                                    checked={isEnabled}
                                    onChange={() => {
                                      const next = isEnabled
                                        ? toolQueries.filter(q => q !== item.id)
                                        : [...toolQueries, item.id];
                                      updateSelectedNode('enabledQueries', next);
                                    }}
                                    className="mt-0.5 rounded text-red-600 focus:ring-red-500 cursor-pointer"
                                  />
                                  <div className="min-w-0">
                                    <span className="font-bold text-gray-800 block text-[11px] leading-tight">{item.label}</span>
                                    <span className="text-[9px] text-[#5A6B61] block leading-tight">{item.desc}</span>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        {/* Atalho para importar do Gatilho se disponível */}
                        {hasTriggerData && (!selectedNode.data.ifood_client_id || !selectedNode.data.ifood_client_secret) && (
                          <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-xl flex items-center justify-between gap-2">
                            <div className="text-[10px] text-sky-900 leading-tight">
                              💡 <b>Credenciais no Gatilho</b>: Você já configurou chaves no Gatilho iFood.
                            </div>
                            <button
                              type="button"
                              onClick={handleCopyFromTrigger}
                              className="px-2 py-1 text-[10px] font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition shrink-0 cursor-pointer"
                            >
                              {copiedField === 'copied_ifood' ? '✓ Importado!' : 'Copiar do Gatilho'}
                            </button>
                          </div>
                        )}

                        {/* Credenciais Opcionais de API Desenvolvedor */}
                        <details className="bg-gray-50/80 border border-[#E2E8E4] rounded-xl p-3 space-y-2.5 group">
                          <summary className="text-[10px] font-bold text-[#5A6B61] uppercase tracking-wider cursor-pointer list-none flex items-center justify-between">
                            <span>Credenciais Opcionais Developer (developer.ifood.com.br)</span>
                            <span className="text-[9px] font-bold text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                          </summary>

                          <div className="pt-2 space-y-2.5">
                            <div>
                              <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                                Client ID (Integração Própria):
                              </label>
                              <input
                                type="text"
                                value={selectedNode.data.ifood_client_id !== undefined ? selectedNode.data.ifood_client_id : (trigNode?.data?.ifood_client_id || '')}
                                onChange={(e) => updateSelectedNode('ifood_client_id', e.target.value)}
                                placeholder="UUID do Client ID obtido em developer.ifood.com.br"
                                className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-red-600"
                              />
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-[11px] font-bold text-[#5A6B61]">
                                  Client Secret:
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setShowDeliveryPassword(!showDeliveryPassword)}
                                  className="text-[9px] font-bold text-gray-500 hover:text-gray-700 flex items-center gap-0.5 cursor-pointer"
                                >
                                  {showDeliveryPassword ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                                  {showDeliveryPassword ? 'Ocultar' : 'Exibir'}
                                </button>
                              </div>
                              <input
                                type={showDeliveryPassword ? "text" : "password"}
                                value={selectedNode.data.ifood_client_secret !== undefined ? selectedNode.data.ifood_client_secret : (trigNode?.data?.ifood_client_secret || '')}
                                onChange={(e) => updateSelectedNode('ifood_client_secret', e.target.value)}
                                placeholder="••••••••••••••••"
                                className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-red-600"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                                  Merchant ID (Loja):
                                </label>
                                <input
                                  type="text"
                                  value={selectedNode.data.ifood_merchant_id !== undefined ? selectedNode.data.ifood_merchant_id : (trigNode?.data?.ifood_merchant_id || '')}
                                  onChange={(e) => updateSelectedNode('ifood_merchant_id', e.target.value)}
                                  placeholder="UUID da Loja"
                                  className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-red-600"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                                  Polling (segundos):
                                </label>
                                <input
                                  type="number"
                                  value={selectedNode.data.ifood_poll_interval !== undefined ? selectedNode.data.ifood_poll_interval : (trigNode?.data?.ifood_poll_interval || 30)}
                                  onChange={(e) => updateSelectedNode('ifood_poll_interval', Number(e.target.value))}
                                  placeholder="30"
                                  className="w-full text-xs font-mono font-semibold p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-red-600 text-center"
                                />
                              </div>
                            </div>
                          </div>
                        </details>

                        {/* Botões de Ação */}
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => testSingleTool(selectedNode)}
                            disabled={testingToolId === selectedNode.id}
                            className="py-2 px-3 text-[11px] font-bold bg-white hover:bg-gray-50 text-gray-700 border border-[#E2E8E4] rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Activity className={`w-3.5 h-3.5 ${testingToolId === selectedNode.id ? 'animate-spin text-red-600' : 'text-gray-500'}`} />
                            <span>{testingToolId === selectedNode.id ? 'Testando...' : 'Diagnosticar'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleSaveIFoodTool}
                            className="py-2 px-3 text-[11px] font-bold bg-[#CA3D26] hover:bg-[#b03420] text-white rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{copiedField === 'saved_ifood' ? 'Salvo!' : 'Salvar Alterações'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })()}

{/* BLOCO DEDICADO: 99 FOOD MARKETPLACE */}
                  {(selectedNode.data.type === '99food' || selectedNode.id === 'tool-99food') && (() => {
                    const trigNode = nodes.find((n) => n.type === 'trigger' && (n.data?.type === '99food_event' || n.id === 'trig-99food'));
                    const hasPortalSession = toolDiagnosticResult?.auth_source === 'portal_session' || selectedNode.data.healthStatus === 'online' || selectedNode.data.healthLabel?.includes('Portal') || selectedNode.data.healthLabel?.includes('Online');
                    const hasCredentials = Boolean(
                      (selectedNode.data.ninety_nine_user && selectedNode.data.ninety_nine_password) ||
                      (trigNode?.data?.ninety_nine_user && trigNode?.data?.ninety_nine_password)
                    );
                    const isConfigured = hasPortalSession || hasCredentials;
                    const hasTriggerData = trigNode && (trigNode.data?.ninety_nine_user || trigNode.data?.ninety_nine_password);

                    const handleCopyFromTrigger = () => {
                      if (!trigNode) return;
                      const d = trigNode.data || {};
                      if (d.ninety_nine_user) updateSelectedNode('ninety_nine_user', d.ninety_nine_user);
                      if (d.ninety_nine_password) updateSelectedNode('ninety_nine_password', d.ninety_nine_password);
                      if (d.ninety_nine_store_id) updateSelectedNode('ninety_nine_store_id', d.ninety_nine_store_id);
                      if (d.ninety_nine_portal_url) updateSelectedNode('ninety_nine_portal_url', d.ninety_nine_portal_url);
                      setCopiedField('copied_99food');
                      setTimeout(() => setCopiedField(null), 2500);
                    };

                    const handleSave99FoodTool = async () => {
                      try {
                        pushHistory(nodes, edges);
                        await handleSave(nodes, edges);
                        setCopiedField('saved_99food');
                        setTimeout(() => setCopiedField(null), 3000);
                        testSingleTool(selectedNode);
                      } catch (e) {
                        console.error('Erro ao salvar ferramenta 99 Food:', e);
                      }
                    };

                    return (
                      <div className="space-y-3.5">
                        {/* Cabeçalho da Ferramenta */}
                        <div className="flex items-center justify-between pb-1.5 border-b border-[#E2E8E4]">
                          <div className="flex items-center gap-2">
                            <PlatformLogo type="99food" className="w-5 h-5 rounded-md" />
                            <div>
                              <div className="text-[11px] font-black text-[#16422B] uppercase tracking-wide">
                                99 Food Marketplace (Conector MCP)
                              </div>
                              <div className="text-[9px] text-[#5A6B61]">
                                Consultas Ativas: Portal do Lojista & Radar ERP
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Banner Informativo / Sessão Ativa */}
                        {hasPortalSession ? (
                          <div className="p-3.5 rounded-2xl border border-emerald-300 bg-gradient-to-br from-emerald-50/90 to-teal-50/60 shadow-2xs space-y-2.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                <span className="text-[11px] font-black text-emerald-950 uppercase tracking-wide">
                                  Sessão Portal 99 Food Conectada
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                              <div className="bg-white/80 p-2 rounded-xl border border-emerald-100">
                                <span className="text-gray-500 block text-[9px] font-semibold">Loja / Store ID:</span>
                                <span className="font-extrabold text-[#16422B] text-xs">Unidade Principal</span>
                                <span className="text-[9px] text-gray-500 block font-mono">{selectedNode.data.ninety_nine_store_id || 'Portal Conectado'}</span>
                              </div>
                              <div className="bg-white/80 p-2 rounded-xl border border-emerald-100">
                                <span className="text-gray-500 block text-[9px] font-semibold">Perfil Autenticado:</span>
                                <span className="font-extrabold text-emerald-900 truncate block">Administrador</span>
                                <span className="text-[9px] text-emerald-700 font-bold block">Superadministrador</span>
                              </div>
                            </div>

                            <p className="text-[10px] text-emerald-900 leading-relaxed">
                              ✓ Sessão autenticada no Portal do Lojista (merchant.99app.com) com automação Playwright. O agente possui autorização para consultar pedidos, faturamento e cancelamentos direto no painel da 99 Food.
                            </p>

                            <div className="pt-1 border-t border-emerald-200/60 flex items-center justify-between text-[9px] text-emerald-800">
                              <span>Tipo de Conexão: <b>Automação Playwright Headless</b></span>
                              <span className="font-mono font-bold text-emerald-900">100% Operacional</span>
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 rounded-xl border text-xs bg-blue-50/70 border-blue-200 text-blue-950 space-y-1">
                            <div className="font-bold flex items-center gap-1.5 text-[11px] text-blue-900">
                              <span>💡</span>
                              <span>Conector Reverso: Portal do Lojista + Radar ERP</span>
                            </div>
                            <p className="text-[10px] leading-relaxed opacity-90 text-blue-900">
                              Como a 99 Food não disponibiliza API pública aberta no Brasil, o agente opera via consultas autenticadas no Portal do Lojista (merchant.99app.com) com automação Playwright Headless e cruzamento contínuo com o Radar de Pedidos do ERP.
                            </p>
                          </div>
                        )}

                        {/* Especificações Operacionais */}
                        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                          <div className="p-2 bg-gray-50 border border-gray-100 rounded-xl flex flex-col justify-between">
                            <span className="text-gray-500 font-medium">Portal do Lojista:</span>
                            <span className="font-mono font-bold text-gray-800 truncate">merchant.99app.com</span>
                            <span className="text-[8px] text-amber-700 font-semibold mt-0.5">✓ Web Autenticada</span>
                          </div>
                          <div className="p-2 bg-gray-50 border border-gray-100 rounded-xl flex flex-col justify-between">
                            <span className="text-gray-500 font-medium">Automação IA:</span>
                            <span className="font-mono font-bold text-gray-800 truncate">Playwright Headless</span>
                            <span className="text-[8px] text-emerald-700 font-semibold mt-0.5">✓ Sniffing & Sessão</span>
                          </div>
                          <div className="p-2 bg-gray-50 border border-gray-100 rounded-xl flex flex-col justify-between">
                            <span className="text-gray-500 font-medium">Radar de Retaguarda:</span>
                            <span className="font-mono font-bold text-gray-800 truncate">ERP Cloud</span>
                            <span className="text-[8px] text-teal-700 font-semibold mt-0.5">✓ Canal 99food Ativo</span>
                          </div>
                          <div className="p-2 bg-gray-50 border border-gray-100 rounded-xl flex flex-col justify-between">
                            <span className="text-gray-500 font-medium">Receptor Webhook:</span>
                            <span className="font-mono font-bold text-gray-800 truncate">/api/webhooks/99food</span>
                            <span className="text-[8px] text-emerald-700 font-semibold mt-0.5">✓ Pronto</span>
                          </div>
                        </div>

                        {/* Configurações de Consulta da Ferramenta para os Agentes */}
                        <div className="p-3 bg-gray-50/80 border border-[#E2E8E4] rounded-xl space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-[#5A6B61] uppercase tracking-wider block">
                              Consultas Ativas Habilitadas para os Agentes
                            </span>
                          </div>

                          <div className="space-y-1.5 text-[11px]">
                            {[
                              { id: 'query_store_status', label: 'Status da Loja (Aberta / Fechada / Pausa)', desc: 'Audita abertura programada e alertas de loja fechada na 99 Food' },
                              { id: 'query_orders', label: 'Consulta de Pedidos & Fila em Tempo Real', desc: 'Permite ao agente auditar cancelamentos e fluxo de pedidos da 99 Food' },
                              { id: 'query_catalog', label: 'Cardápio & Itens Pausados vs ERP', desc: 'Compara itens pausados com o estoque do ERP' },
                              { id: 'query_sales_metrics', label: 'Métricas de Vendas, Desempenho & Faturamento', desc: 'Captura relatórios operacionais e KPIs da 99 Food' },
                              { id: 'radar_erp', label: 'Radar de Retaguarda Contínuo (ERP)', desc: 'Cruza faturamento e cancelamentos do canal 99food no ERP' }
                            ].map((item) => {
                              const toolQueries = Array.isArray(selectedNode.data.enabledQueries)
                                ? selectedNode.data.enabledQueries
                                : ['query_store_status', 'query_orders', 'query_catalog', 'query_sales_metrics', 'radar_erp'];
                              const isEnabled = toolQueries.includes(item.id);

                              return (
                                <label key={item.id} className="flex items-start gap-2 p-1.5 rounded-lg hover:bg-white transition cursor-pointer border border-transparent hover:border-gray-200">
                                  <input
                                    type="checkbox"
                                    checked={isEnabled}
                                    onChange={() => {
                                      const next = isEnabled
                                        ? toolQueries.filter(q => q !== item.id)
                                        : [...toolQueries, item.id];
                                      updateSelectedNode('enabledQueries', next);
                                    }}
                                    className="mt-0.5 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                                  />
                                  <div className="min-w-0">
                                    <span className="font-bold text-gray-800 block text-[11px] leading-tight">{item.label}</span>
                                    <span className="text-[9px] text-[#5A6B61] block leading-tight">{item.desc}</span>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        {/* Atalho para importar do Gatilho se disponível */}
                        {hasTriggerData && (!selectedNode.data.ninety_nine_user || !selectedNode.data.ninety_nine_password) && (
                          <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-xl flex items-center justify-between gap-2">
                            <div className="text-[10px] text-sky-900 leading-tight">
                              💡 <b>Credenciais no Gatilho</b>: Você já configurou o usuário <b>{trigNode.data.ninety_nine_user}</b> no Gatilho 99 Food.
                            </div>
                            <button
                              type="button"
                              onClick={handleCopyFromTrigger}
                              className="px-2 py-1 text-[10px] font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-lg transition shrink-0 cursor-pointer"
                            >
                              {copiedField === 'copied_99food' ? '✓ Importado!' : 'Copiar do Gatilho'}
                            </button>
                          </div>
                        )}

                        {/* Formulário de Parâmetros e Credenciais */}
                        <details className="bg-gray-50/80 border border-[#E2E8E4] rounded-xl p-3 space-y-2.5 group">
                          <summary className="text-[10px] font-bold text-[#5A6B61] uppercase tracking-wider cursor-pointer list-none flex items-center justify-between">
                            <span>Credenciais do Portal do Lojista 99 Food</span>
                            <span className="text-[9px] font-bold text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                          </summary>

                          <div className="pt-2 space-y-2.5">
                            <div>
                              <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                                URL do Portal do Lojista:
                              </label>
                              <input
                                type="text"
                                value={selectedNode.data.ninety_nine_portal_url !== undefined ? selectedNode.data.ninety_nine_portal_url : (trigNode?.data?.ninety_nine_portal_url || 'https://merchant.99app.com')}
                                onChange={(e) => updateSelectedNode('ninety_nine_portal_url', e.target.value)}
                                placeholder="https://merchant.99app.com"
                                className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#16422B]"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                                  Usuário / E-mail:
                                </label>
                                <input
                                  type="text"
                                  value={selectedNode.data.ninety_nine_user !== undefined ? selectedNode.data.ninety_nine_user : (trigNode?.data?.ninety_nine_user || '')}
                                  onChange={(e) => updateSelectedNode('ninety_nine_user', e.target.value)}
                                  placeholder="Ex: admin@empresa.com"
                                  className="w-full text-xs p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#16422B]"
                                />
                              </div>
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-[11px] font-bold text-[#5A6B61]">
                                    Senha do Portal:
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => setShowDeliveryPassword(!showDeliveryPassword)}
                                    className="text-[9px] font-bold text-gray-500 hover:text-gray-700 flex items-center gap-0.5 cursor-pointer"
                                  >
                                    {showDeliveryPassword ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                                    {showDeliveryPassword ? 'Ocultar' : 'Exibir'}
                                  </button>
                                </div>
                                <input
                                  type={showDeliveryPassword ? "text" : "password"}
                                  value={selectedNode.data.ninety_nine_password !== undefined ? selectedNode.data.ninety_nine_password : (trigNode?.data?.ninety_nine_password || '')}
                                  onChange={(e) => updateSelectedNode('ninety_nine_password', e.target.value)}
                                  placeholder="••••••••••••"
                                  className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#16422B]"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                                Store ID 99 Food (Opcional):
                              </label>
                              <input
                                type="text"
                                value={selectedNode.data.ninety_nine_store_id !== undefined ? selectedNode.data.ninety_nine_store_id : (trigNode?.data?.ninety_nine_store_id || '5764612229169941840')}
                                onChange={(e) => updateSelectedNode('ninety_nine_store_id', e.target.value)}
                                placeholder="Store ID numérico ou UUID"
                                className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-[#16422B]"
                              />
                            </div>
                          </div>
                        </details>

                        {/* Botões de Ação */}
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => testSingleTool(selectedNode)}
                            disabled={testingToolId === selectedNode.id}
                            className="py-2 px-3 text-[11px] font-bold bg-white hover:bg-gray-50 text-gray-700 border border-[#E2E8E4] rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Activity className={`w-3.5 h-3.5 ${testingToolId === selectedNode.id ? 'animate-spin text-amber-600' : 'text-gray-500'}`} />
                            <span>{testingToolId === selectedNode.id ? 'Testando...' : 'Diagnosticar'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleSave99FoodTool}
                            className="py-2 px-3 text-[11px] font-bold bg-[#CA3D26] hover:bg-[#b03420] text-white rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{copiedField === 'saved_99food' ? 'Salvo!' : 'Salvar Alterações'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })()}                  {selectedNode.data.type === 'notion' && (() => {
                    const defaultUrl = 'https://app.notion.com/p/be-tea-288f5bc3adb6804fb503fbe9f954758a';
                    const handleSaveNotionConfig = async () => {
                      try {
                        const res = await fetch('/api/tools/notion/config', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            api_key: selectedNode.data.notionApiKey || '',
                            root_page_id: selectedNode.data.notionPageId || '288f5bc3adb6804fb503fbe9f954758a'
                          })
                        });
                        if (res.ok) {
                          setCopiedField('saved_notion');
                          setTimeout(() => setCopiedField(null), 3000);
                          checkSingleToolHealth(selectedNode.id, selectedNode.data);
                        }
                      } catch (err) {
                        console.error('Erro ao salvar config Notion:', err);
                      }
                    };

                    return (
                      <>
                        <div className="p-3 rounded-2xl bg-stone-50 border border-stone-200 text-xs space-y-2">
                          <div className="font-bold text-stone-900 flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-stone-900"></span>
                              Notion Workspace Corporativo
                            </span>
                            <span className="text-[9px] bg-gray-100 text-gray-800 px-2 py-0.5 rounded-full font-mono font-bold border border-gray-200 whitespace-nowrap shrink-0">
                              API v1
                            </span>
                          </div>
                          <p className="text-[11px] text-stone-700 leading-relaxed">
                            Permite aos agentes consultar a base de conhecimento corporativa: <b>CNPJ</b>, <b>contas bancárias</b>, <b>senhas de sistemas</b> e <b>POPs operacionais</b>.
                          </p>
                          <a
                            href={selectedNode.data.notionPageUrl || defaultUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 hover:text-emerald-900 underline"
                          >
                            Abrir Página no Notion ↗
                          </a>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                            Notion Internal Integration Secret:
                          </label>
                          <input
                            type="password"
                            placeholder="secret_... ou ntn_..."
                            value={selectedNode.data.notionApiKey || ''}
                            onChange={(e) => updateSelectedNode('notionApiKey', e.target.value)}
                            className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl focus:border-[#16422B] outline-none"
                          />
                          <p className="text-[10px] text-[#5A6B61] mt-1 leading-snug">
                            Gere em <a href="https://www.notion.so/profile/integrations" target="_blank" rel="noreferrer" className="text-emerald-800 underline font-semibold">notion.so/profile/integrations</a> e conecte à página via menu '...' &gt; Conexões no Notion.
                          </p>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                            ID ou URL da Página Principal / Hub:
                          </label>
                          <input
                            type="text"
                            placeholder="288f5bc3adb6804fb503fbe9f954758a"
                            value={selectedNode.data.notionPageId || '288f5bc3adb6804fb503fbe9f954758a'}
                            onChange={(e) => updateSelectedNode('notionPageId', e.target.value)}
                            className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl focus:border-[#16422B] outline-none"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handleSaveNotionConfig}
                          className="w-full py-2 px-3 bg-[#16422B] hover:bg-[#1E5738] text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>{copiedField === 'saved_notion' ? '✅ Credenciais Salvas no Servidor!' : '💾 Salvar e Sincronizar'}</span>
                        </button>
                      </>
                    );
                  })()}

                  {selectedNode.data.type === 'drive' && (() => {
                    const searchMode = selectedNode.data.driveSearchMode || 'all';
                    return (
                      <>
                        <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                          <div className="font-bold text-emerald-900 mb-1 flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                              Google Workspace Autenticado
                            </span>
                            <span className="text-[9px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-mono font-bold border border-emerald-200 whitespace-nowrap shrink-0">
                              OAuth 2.0
                            </span>
                          </div>
                          <p className="text-[11px] text-emerald-800 leading-relaxed">
                            Conectado via conta corporativa <b>admin@example.com</b>. Acesso nativo para pesquisar manuais, receitas, POPs e planilhas operacionais.
                          </p>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Conta Google Autorizada:</label>
                          <input
                            type="text"
                            value={selectedNode.data.driveAccount || 'admin@example.com'}
                            onChange={(e) => updateSelectedNode('driveAccount', e.target.value)}
                            className="w-full text-xs font-semibold p-2 border border-[#E2E8E4] rounded-xl bg-gray-50 text-gray-700"
                            readOnly
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Alcance da Busca dos Agentes:</label>
                          <select
                            value={searchMode}
                            onChange={(e) => updateSelectedNode('driveSearchMode', e.target.value)}
                            className="w-full text-xs font-semibold p-2 border border-[#E2E8E4] rounded-xl bg-white"
                          >
                            <option value="all">📂 Todo o Google Drive (Meu Drive & Drives Compartilhados)</option>
                            <option value="folder">📁 Restringir a uma Pasta Específica</option>
                            <option value="file">📄 Selecionar 1 Arquivo Específico (Planilha, Doc ou PDF)</option>
                          </select>
                        </div>

                        {searchMode === 'folder' && (
                          <div className="space-y-2 p-3 bg-[#EFF5F1] border border-emerald-200/80 rounded-2xl">
                            <label className="block text-[11px] font-extrabold text-[#16422B] flex items-center gap-1.5">
                              <span>📁</span>
                              <span>Link ou ID da Pasta Raiz no Drive:</span>
                            </label>
                            <input
                              type="text"
                              value={selectedNode.data.driveFolderFilter || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateSelectedNode('driveFolderFilter', val);
                                if (val) {
                                  let userEmail = '';
                                  try {
                                    const saved = localStorage.getItem('aiboard_user');
                                    if (saved) userEmail = JSON.parse(saved).email || '';
                                  } catch (err) {}
                                  fetch(`/api/tools/drive/file-info?id=${encodeURIComponent(val)}`, {
                                    headers: { 'X-User-Email': userEmail }
                                  })
                                    .then((r) => r.json())
                                    .then((res) => {
                                      if (res.name) {
                                        updateSelectedNode('driveFolderName', res.name.trim());
                                      }
                                    })
                                    .catch(() => {});
                                } else {
                                  updateSelectedNode('driveFolderName', '');
                                }
                              }}
                              placeholder="Cole o link ou ID da pasta do Drive (ex: https://drive.google.com/drive/folders/...)"
                              className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white"
                            />
                            {selectedNode.data.driveFolderName && (
                              <div className="flex items-center gap-2 p-2 bg-white border border-amber-300 rounded-xl shadow-2xs">
                                <span className="text-sm">📁</span>
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-extrabold text-amber-950 truncate">
                                    {selectedNode.data.driveFolderName}
                                  </div>
                                  <div className="text-[10px] text-amber-700">
                                    Pasta validada no Google Drive
                                  </div>
                                </div>
                              </div>
                            )}
                            <span className="text-[10px] text-[#5A6B61] block">
                              Os agentes pesquisarão arquivos contidos dentro desta pasta.
                            </span>
                          </div>
                        )}

                        {searchMode === 'file' && (
                          <div className="space-y-3 p-3.5 bg-blue-50/60 border border-blue-200 rounded-2xl">
                            {/* Cabeçalho */}
                            <div className="flex items-center justify-between">
                              <label className="text-[11px] font-extrabold text-[#16422B] flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5 text-blue-600" />
                                <span>Arquivo Único Selecionado:</span>
                              </label>
                            </div>

                            {/* Badge do Arquivo Ativo Selecionado */}
                            {selectedNode.data.driveFileFilter ? (
                              <div className="flex items-center justify-between gap-2 p-2.5 bg-white border border-emerald-300 rounded-xl shadow-2xs">
                                <div className="flex items-center gap-2 min-w-0">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                  <div className="min-w-0">
                                    <div className="font-bold text-[#16422B] text-xs truncate">
                                      {selectedNode.data.driveFileName || selectedNode.data.driveFileFilter}
                                    </div>
                                    <div className="text-[10px] text-gray-500 font-mono truncate">
                                      ID: {selectedNode.data.driveFileFilter}
                                    </div>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateSelectedNode('driveFileFilter', '');
                                    updateSelectedNode('driveFileName', '');
                                  }}
                                  className="text-[10px] text-red-500 hover:text-red-700 font-bold px-2 py-1 rounded-lg hover:bg-red-50 transition cursor-pointer shrink-0"
                                >
                                  Remover
                                </button>
                              </div>
                            ) : (
                              <div className="text-[11px] text-[#5A6B61] italic bg-white/80 p-2.5 border border-dashed border-blue-200 rounded-xl">
                                Nenhum arquivo selecionado. Busque abaixo pelo nome ou cole o link do Google Docs/Sheets.
                              </div>
                            )}

                            {/* Campo de Busca no Google Drive (com busca por Enter ou clique) */}
                            <div className="space-y-1.5 pt-1">
                              <label className="block text-[10px] font-bold text-[#5A6B61] uppercase tracking-wider">
                                Pesquisar no Drive da Empresa ou Colar Link:
                              </label>
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  fetchDriveFilesList(driveSearchQuery);
                                }}
                                className="flex items-center gap-1.5"
                              >
                                <div className="relative flex-1">
                                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                  <input
                                    type="text"
                                    value={driveSearchQuery}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setDriveSearchQuery(val);
                                      // Se o usuário colou um link direto do Drive, detecta e seleciona na hora!
                                      const match = val.match(/\/d\/([a-zA-Z0-9_-]+)/);
                                      if (match && match[1]) {
                                        updateSelectedNode('driveFileFilter', match[1]);
                                        updateSelectedNode('driveFileName', 'Documento selecionado via Link');
                                      }
                                    }}
                                    placeholder="Digite o nome (ex: Contagem, Estoque, CMV)..."
                                    className="w-full text-xs pl-8 pr-2 py-2 bg-white border border-blue-200 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                  />
                                </div>
                                <button
                                  type="submit"
                                  disabled={loadingDriveFiles}
                                  className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 py-2 rounded-xl transition shadow-2xs flex items-center gap-1.5 cursor-pointer shrink-0"
                                >
                                  <Search className={`w-3.5 h-3.5 ${loadingDriveFiles ? 'animate-spin' : ''}`} />
                                  <span>{loadingDriveFiles ? 'Buscando...' : 'Buscar'}</span>
                                </button>
                              </form>
                            </div>

                            {/* Lista interativa de arquivos buscados no Drive */}
                            {driveFilesList.length > 0 && (
                              <div ref={driveResultsRef} className="space-y-1 max-h-56 overflow-y-auto border border-blue-200 bg-white rounded-xl p-1.5 shadow-2xs">
                                <div className="text-[10px] font-extrabold text-[#5A6B61] px-1.5 py-1 flex items-center justify-between border-b border-gray-100 mb-1">
                                  <span>Arquivos Encontrados ({driveFilesList.length}):</span>
                                  <button
                                    type="button"
                                    onClick={() => setDriveFilesList([])}
                                    className="text-gray-400 hover:text-gray-600 cursor-pointer font-bold px-1"
                                    title="Fechar resultados"
                                  >
                                    ✕
                                  </button>
                                </div>
                                {driveFilesList.map((f) => (
                                  <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => {
                                      updateSelectedNode('driveFileFilter', f.id);
                                      updateSelectedNode('driveFileName', f.name);
                                      setDriveFilesList([]);
                                      setDriveSearchNotFound(false);
                                    }}
                                    className="w-full text-left p-2 rounded-lg hover:bg-blue-50 border border-transparent hover:border-blue-200 transition flex items-center justify-between gap-2 group cursor-pointer"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="text-xs font-bold text-[#16422B] truncate group-hover:text-blue-800 flex items-center gap-1.5">
                                        <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                        <span className="truncate">{f.name}</span>
                                      </div>
                                      <div className="text-[10px] text-gray-400 font-mono truncate pl-5">
                                        ID: {f.id} {f.driveId ? '• Drive AI Board' : ''}
                                      </div>
                                    </div>
                                    <span className="text-[10px] px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 font-bold shrink-0 opacity-80 group-hover:opacity-100 transition">
                                      Selecionar
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Aviso se a busca não retornou nada */}
                            {driveSearchNotFound && !loadingDriveFiles && driveFilesList.length === 0 && (
                              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-center text-xs text-amber-800">
                                Nenhum arquivo encontrado com o termo "<b>{driveSearchQuery}</b>". Verifique a grafia ou cole o link do documento.
                              </div>
                            )}

                            <span className="text-[10px] text-[#5A6B61] block leading-tight">
                              💡 Digite o nome do arquivo acima e clique em <b>Buscar</b> para localizar no Google Drive (incluindo Drives Compartilhados da AI Board).
                            </span>
                          </div>
                        )}

                        <div>
                          <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Formatos de Documento Suportados:</label>
                          <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-semibold text-gray-700">
                            <div className="p-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                              📄 Docs / Word
                            </div>
                            <div className="p-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                              📊 Sheets / Excel
                            </div>
                            <div className="p-1.5 bg-purple-50 border border-purple-200 rounded-lg text-purple-900">
                              📑 PDFs / Text
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  {selectedNode.data.type === 'gmail' && (
                    <>
                      <div>
                        <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Conta Conectada (Gmail):</label>
                        <input
                          type="email"
                          value={selectedNode.data.gmailAccount ?? 'admin@example.com'}
                          onChange={(e) => updateSelectedNode('gmailAccount', e.target.value)}
                          placeholder="admin@example.com"
                          className="w-full text-xs font-semibold p-2 border border-[#E2E8E4] rounded-xl"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Permissões do Conector:</label>
                        <select
                          value={selectedNode.data.gmailScope || 'read_write'}
                          onChange={(e) => updateSelectedNode('gmailScope', e.target.value)}
                          className="w-full text-xs font-semibold p-2 border border-[#E2E8E4] rounded-xl bg-white"
                        >
                          <option value="read_write">Leitura e Envio de E-mails (Total)</option>
                          <option value="readonly">Somente Leitura e Busca de Mensagens</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Filtro de Leitura Padrão:</label>
                        <input
                          type="text"
                          value={selectedNode.data.gmailDefaultQuery ?? ''}
                          onChange={(e) => updateSelectedNode('gmailDefaultQuery', e.target.value)}
                          placeholder="ex: is:unread label:financeiro ou from:jvrio"
                          className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Assinatura Automática no Envio:</label>
                        <input
                          type="text"
                          value={selectedNode.data.gmailSignature ?? ''}
                          onChange={(e) => updateSelectedNode('gmailSignature', e.target.value)}
                          placeholder="Enviado automaticamente pela Central de Inteligência AI Board"
                          className="w-full text-xs font-semibold p-2 border border-[#E2E8E4] rounded-xl"
                        />
                      </div>
                    </>
                  )}

                  {selectedNode.data.type === 'freescout' && (() => {
                    const accessMode = selectedNode.data.freescoutAccessMode || 'mariadb';
                    return (
                      <>
                        <div>
                          <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Modo de Acesso ao FreeScout:</label>
                          <select
                            value={accessMode}
                            onChange={(e) => updateSelectedNode('freescoutAccessMode', e.target.value)}
                            className="w-full text-xs font-semibold p-2 border border-[#E2E8E4] rounded-xl bg-white"
                          >
                            <option value="mariadb">⭐ Conexão Direta MariaDB (Nativa / Gratuita / Latência 1ms)</option>
                            <option value="api">Módulo REST API (Oficial / Pago $14.99)</option>
                          </select>
                        </div>

                        {accessMode === 'mariadb' ? (
                          <div className="space-y-2.5">
                            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                              <div className="font-bold text-emerald-900 mb-1 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                Banco MariaDB Local Conectado
                              </div>
                              <p className="text-[11px] text-emerald-800 leading-relaxed">
                                Os agentes consultam os chamados diretamente na base do Helpdesk na VPS. Custo zero, sem necessidade de comprar o módulo oficial de $14.99.
                              </p>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                              <div className="p-2 bg-gray-50 border border-gray-200 rounded-lg">
                                <span className="text-gray-500 block font-medium">Host / Porta:</span>
                                <span className="font-mono font-bold text-gray-800">freescout-db:3306</span>
                              </div>
                              <div className="p-2 bg-gray-50 border border-gray-200 rounded-lg">
                                <span className="text-gray-500 block font-medium">Base de Dados:</span>
                                <span className="font-mono font-bold text-gray-800">freescout</span>
                              </div>
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Caixas Postais Monitoradas:</label>
                              <div className="space-y-1.5">
                                <div className="text-[11px] bg-white border border-[#E2E8E4] p-2 rounded-lg flex items-center justify-between">
                                  <span className="font-semibold text-gray-800">🏬 AI Board - Shopping Center</span>
                                  <span className="font-mono text-[10px] text-gray-500">operacoes@empresa.com</span>
                                </div>
                                <div className="text-[11px] bg-white border border-[#E2E8E4] p-2 rounded-lg flex items-center justify-between">
                                  <span className="font-semibold text-gray-800">👥 Recrutamento</span>
                                  <span className="font-mono text-[10px] text-gray-500">rh@empresa.com</span>
                                </div>
                                <div className="text-[11px] bg-white border border-[#E2E8E4] p-2 rounded-lg flex items-center justify-between">
                                  <span className="font-semibold text-gray-800">🎉 Eventos</span>
                                  <span className="font-mono text-[10px] text-gray-500">contato@empresa.com</span>
                                </div>
                              </div>
                            </div>

                            <div>
                              <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">URL Painel Web:</label>
                              <input
                                type="text"
                                value={selectedNode.data.freescoutUrl || ''}
                                onChange={(e) => updateSelectedNode('freescoutUrl', e.target.value)}
                                className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-gray-50 text-gray-700"
                                readOnly
                              />
                            </div>
                          </div>
                        ) : (
                          <>
                            <div>
                              <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">URL Painel Freescout Helpdesk:</label>
                              <input
                                type="text"
                                value={selectedNode.data.freescoutUrl || ''}
                                onChange={(e) => updateSelectedNode('freescoutUrl', e.target.value)}
                                className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">API Key Freescout:</label>
                              <input
                                type="password"
                                placeholder="••••••••••••••••"
                                value={selectedNode.data.freescoutApiKey || ''}
                                onChange={(e) => updateSelectedNode('freescoutApiKey', e.target.value)}
                                className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl"
                              />
                            </div>
                          </>
                        )}
                      </>
                    );
                  })()}

                  {selectedNode.data.type === 'chat' && (
                    <>
                      <div>
                        <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">URL Chatwoot Server:</label>
                        <input
                          type="text"
                          value={selectedNode.data.chatwootUrl || ''}
                          onChange={(e) => updateSelectedNode('chatwootUrl', e.target.value)}
                          className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">ID da Inbox WhatsApp:</label>
                        <input
                          type="text"
                          value={selectedNode.data.chatwootInboxId || '1'}
                          onChange={(e) => updateSelectedNode('chatwootInboxId', e.target.value)}
                          className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl"
                        />
                      </div>
                    </>
                  )}

                  {selectedNode.data.type === 'contaazul' && (() => {
                    const clientId = selectedNode.data.contaAzulClientId || '';
                    const clientSecret = selectedNode.data.contaAzulClientSecret || '';
                    const redirectUri = selectedNode.data.contaAzulRedirectUri || '/api/auth/contaazul/callback';
                    const authUrl = `https://login.contaazul.com/#/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=ESTADO&scope=openid+profile+aws.cognito.signin.user.admin`;

                    const handleSaveServerConfig = async () => {
                      try {
                        const res = await fetch('/api/tools/contaazul/config', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            client_id: clientId,
                            client_secret: clientSecret,
                            redirect_uri: redirectUri
                          })
                        });
                        if (res.ok) {
                          setCopiedField('saved_contaazul');
                          setTimeout(() => setCopiedField(null), 3000);
                        }
                      } catch (e) {
                        console.error('Erro ao salvar credenciais no servidor:', e);
                      }
                    };

                    const overview = contaAzulOverview;
                    const empresaNome = overview?.empresa?.nome || overview?.empresa?.razao_social || 'AI Board Enterprise';
                    const empresaCnpj = overview?.empresa?.cnpj || overview?.empresa?.documento || '00.000.000/0001-00';
                    const pagarCount = overview?.total_contas_a_pagar_mes ?? 0;
                    const receberCount = overview?.total_contas_a_receber_mes ?? 0;
                    const bankCount = overview?.total_contas_bancarias ?? 0;
                    const catCount = overview?.total_categorias_dre ?? 0;

                    return (
                      <div className="space-y-3.5">
                        {/* Status da Empresa Conectada */}
                        <div className="p-3 bg-[#E7F6ED] border border-[#B8E4C9] rounded-2xl flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                              <span className="text-[11px] font-black text-[#16422B] uppercase tracking-wide">
                                {empresaNome}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-[#5A6B61] block mt-0.5">
                              CNPJ: {empresaCnpj} • API v2 Oficial
                            </span>
                          </div>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 whitespace-nowrap shrink-0">
                            Conectado
                          </span>
                        </div>

                        {/* Cobertura Completa de Recursos API Oficial v2 */}
                        <div className="p-3 bg-white rounded-2xl border border-[#E2E8E4] shadow-xs space-y-2">
                          <div className="flex items-center justify-between pb-1.5 border-b border-[#F0F4F1]">
                            <span className="text-[11px] font-black text-[#16422B] uppercase tracking-wider flex items-center gap-1">
                              ⚡ Módulos da API Oficial (100% Integrados)
                            </span>
                            <span className="text-[9px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200 whitespace-nowrap shrink-0">
                              REST v2
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                            <div className="p-2 bg-gray-50 rounded-xl border border-gray-100 flex flex-col justify-between">
                              <span className="font-bold text-gray-800 flex items-center gap-1">
                                💸 Contas a Pagar
                              </span>
                              <span className="text-[9px] text-[#5A6B61] mt-0.5">
                                {loadingContaAzulOverview ? 'Carregando...' : `${pagarCount} títulos este mês`}
                              </span>
                              <span className="text-[8px] font-mono text-emerald-700 mt-0.5">
                                ✓ Busca, Datas & Status
                              </span>
                            </div>

                            <div className="p-2 bg-gray-50 rounded-xl border border-gray-100 flex flex-col justify-between">
                              <span className="font-bold text-gray-800 flex items-center gap-1">
                                💰 Contas a Receber
                              </span>
                              <span className="text-[9px] text-[#5A6B61] mt-0.5">
                                {loadingContaAzulOverview ? 'Carregando...' : `${receberCount} títulos previstos`}
                              </span>
                              <span className="text-[8px] font-mono text-emerald-700 mt-0.5">
                                ✓ Busca, Previsões & Status
                              </span>
                            </div>

                            <div className="p-2 bg-gray-50 rounded-xl border border-gray-100 flex flex-col justify-between">
                              <span className="font-bold text-gray-800 flex items-center gap-1">
                                ⚡ Baixas & Liquidações
                              </span>
                              <span className="text-[9px] text-[#5A6B61] mt-0.5">
                                Liquidação de parcelas
                              </span>
                              <span className="text-[8px] font-mono text-emerald-700 mt-0.5">
                                ✓ Baixa Total, Parcial & Estorno
                              </span>
                            </div>

                            <div className="p-2 bg-gray-50 rounded-xl border border-gray-100 flex flex-col justify-between">
                              <span className="font-bold text-gray-800 flex items-center gap-1">
                                🏦 Contas & Caixas
                              </span>
                              <span className="text-[9px] text-[#5A6B61] mt-0.5">
                                {loadingContaAzulOverview ? 'Carregando...' : `${bankCount} contas cadastradas`}
                              </span>
                              <span className="text-[8px] font-mono text-emerald-700 mt-0.5">
                                ✓ Saldo, Banco & Agência
                              </span>
                            </div>

                            <div className="p-2 bg-gray-50 rounded-xl border border-gray-100 flex flex-col justify-between">
                              <span className="font-bold text-gray-800 flex items-center gap-1">
                                📑 Plano de Contas (DRE)
                              </span>
                              <span className="text-[9px] text-[#5A6B61] mt-0.5">
                                {loadingContaAzulOverview ? 'Carregando...' : `${catCount} categorias`}
                              </span>
                              <span className="text-[8px] font-mono text-emerald-700 mt-0.5">
                                ✓ Árvore Contábil DRE
                              </span>
                            </div>

                            <div className="p-2 bg-gray-50 rounded-xl border border-gray-100 flex flex-col justify-between">
                              <span className="font-bold text-gray-800 flex items-center gap-1">
                                👥 Clientes & Fornecedores
                              </span>
                              <span className="text-[9px] text-[#5A6B61] mt-0.5">
                                220 contatos catalogados
                              </span>
                              <span className="text-[8px] font-mono text-emerald-700 mt-0.5">
                                ✓ Busca por Nome e CNPJ
                              </span>
                            </div>

                            <div className="p-2 bg-gray-50 rounded-xl border border-gray-100 flex flex-col justify-between">
                              <span className="font-bold text-gray-800 flex items-center gap-1">
                                📦 Produtos & Serviços
                              </span>
                              <span className="text-[9px] text-[#5A6B61] mt-0.5">
                                165 produtos / 10 serviços
                              </span>
                              <span className="text-[8px] font-mono text-emerald-700 mt-0.5">
                                ✓ Consulta de Itens & Preços
                              </span>
                            </div>

                            <div className="p-2 bg-gray-50 rounded-xl border border-gray-100 flex flex-col justify-between">
                              <span className="font-bold text-gray-800 flex items-center gap-1">
                                🛍️ Vendas & Orçamentos
                              </span>
                              <span className="text-[9px] text-[#5A6B61] mt-0.5">
                                Pedidos e orçamentos
                              </span>
                              <span className="text-[8px] font-mono text-emerald-700 mt-0.5">
                                ✓ Paginação de 10 a 100 itens
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Conexão Direta Web ao app.contaazul.com.br */}
                        <div className="p-3 bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-2xl border border-blue-200 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-black text-blue-950 uppercase tracking-wide flex items-center gap-1.5">
                              🌐 Conexão Direta: app.contaazul.com.br
                            </span>
                            <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded bg-blue-200 text-blue-900">
                              Web Portal
                            </span>
                          </div>

                          <p className="text-[10px] text-blue-900 leading-relaxed">
                            Recursos complementares avançados disponíveis na tela do portal web:
                          </p>

                          <div className="space-y-1 text-[9px] text-blue-800">
                            <div className="flex items-center gap-1.5">
                              <span className="text-blue-600 font-bold">✔</span>
                              <span><strong>Conciliação Bancária OFX em Tela:</strong> Validação em lote e vínculo direto com extratos.</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-blue-600 font-bold">✔</span>
                              <span><strong>Download de Anexos em PDF:</strong> Acesso a faturas e comprovantes fiscais armazenados.</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-blue-600 font-bold">✔</span>
                              <span><strong>Relatórios Fechados em PDF:</strong> Emissão de DRE Gerencial fechada e Balancete Oficial.</span>
                            </div>
                          </div>

                          <a
                            href="https://app.contaazul.com.br"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1.5 w-full py-2 px-3 text-[10px] font-black bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition flex items-center justify-center gap-1 cursor-pointer"
                          >
                            Abrir Portal Web app.contaazul.com.br ↗
                          </a>
                        </div>

                        {/* Acordeão de Credenciais Técnicas OAuth 2.0 */}
                        <div className="p-3 bg-teal-50/40 rounded-2xl border border-teal-100 space-y-2.5">
                          <button
                            type="button"
                            onClick={() => setShowContaAzulCredentials(!showContaAzulCredentials)}
                            className="w-full flex items-center justify-between text-[11px] font-bold text-teal-900 hover:text-teal-950"
                          >
                            <span className="flex items-center gap-1">
                              🔐 Credenciais Técnicas OAuth 2.0 & Token
                            </span>
                            <span className="text-[10px] font-mono text-teal-700">
                              {showContaAzulCredentials ? '▲ Recolher' : '▼ Expandir'}
                            </span>
                          </button>

                          {showContaAzulCredentials && (
                            <div className="pt-2 border-t border-teal-100 space-y-3">
                              {/* Client ID */}
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-[10px] font-bold text-[#5A6B61]">Client ID:</label>
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(clientId, 'client_id')}
                                    className="text-[9px] font-bold text-teal-700 hover:text-teal-900 flex items-center gap-0.5"
                                  >
                                    {copiedField === 'client_id' ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5" />}
                                    {copiedField === 'client_id' ? 'Copiado!' : 'Copiar'}
                                  </button>
                                </div>
                                <input
                                  type="text"
                                  value={clientId}
                                  onChange={(e) => updateSelectedNode('contaAzulClientId', e.target.value)}
                                  className="w-full text-[11px] font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white focus:outline-none focus:border-teal-600"
                                />
                              </div>

                              {/* Client Secret */}
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-[10px] font-bold text-[#5A6B61]">Client Secret:</label>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setShowContaAzulSecret(!showContaAzulSecret)}
                                      className="text-[9px] font-bold text-gray-500 hover:text-gray-700 flex items-center gap-0.5"
                                    >
                                      {showContaAzulSecret ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                                      {showContaAzulSecret ? 'Ocultar' : 'Exibir'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => copyToClipboard(clientSecret, 'client_secret')}
                                      className="text-[9px] font-bold text-teal-700 hover:text-teal-900 flex items-center gap-0.5"
                                    >
                                      {copiedField === 'client_secret' ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5" />}
                                      {copiedField === 'client_secret' ? 'Copiado!' : 'Copiar'}
                                    </button>
                                  </div>
                                </div>
                                <input
                                  type={showContaAzulSecret ? 'text' : 'password'}
                                  value={clientSecret}
                                  onChange={(e) => updateSelectedNode('contaAzulClientSecret', e.target.value)}
                                  className="w-full text-[11px] font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white focus:outline-none focus:border-teal-600"
                                />
                              </div>

                              {/* Redirect URI */}
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-[10px] font-bold text-[#5A6B61]">URL de Redirecionamento (Callback):</label>
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(redirectUri, 'redirect_uri')}
                                    className="text-[9px] font-bold text-teal-700 hover:text-teal-900 flex items-center gap-0.5"
                                  >
                                    {copiedField === 'redirect_uri' ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5" />}
                                    {copiedField === 'redirect_uri' ? 'Copiado!' : 'Copiar'}
                                  </button>
                                </div>
                                <input
                                  type="text"
                                  readOnly
                                  value={redirectUri}
                                  className="w-full text-[11px] font-mono p-2 border border-gray-200 rounded-xl bg-gray-50 text-gray-700 select-all cursor-pointer"
                                  onClick={(e) => e.target.select()}
                                />
                              </div>

                              {/* URL de Autorização OAuth */}
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-[10px] font-bold text-[#5A6B61]">URL de Autorização Gerada:</label>
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(authUrl, 'auth_url')}
                                    className="text-[9px] font-bold text-teal-700 hover:text-teal-900 flex items-center gap-0.5"
                                  >
                                    {copiedField === 'auth_url' ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5" />}
                                    {copiedField === 'auth_url' ? 'Copiado!' : 'Copiar URL'}
                                  </button>
                                </div>
                                <input
                                  type="text"
                                  readOnly
                                  value={authUrl}
                                  className="w-full text-[10px] font-mono p-1.5 border border-gray-200 rounded-xl bg-gray-50 text-gray-600 select-all truncate"
                                  onClick={(e) => e.target.select()}
                                />
                              </div>

                              {/* Ações */}
                              <div className="pt-1 space-y-2">
                                <a
                                  href={authUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-full py-2 px-3 text-xs font-black bg-[#00A4D8] hover:bg-[#008BB8] text-white rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer text-center"
                                >
                                  🔗 Reconectar & Reautorizar no Conta Azul
                                </a>

                                <button
                                  type="button"
                                  onClick={handleSaveServerConfig}
                                  className="w-full py-1.5 px-3 text-[10px] font-bold bg-white hover:bg-teal-50 text-teal-800 border border-teal-300 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  {copiedField === 'saved_contaazul' ? '✅ Credenciais Salvas no Servidor!' : '💾 Sincronizar Credenciais com o Servidor'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {selectedNode.data.type === 'bank' && (() => {
                    const clientId = selectedNode.data.pluggyClientId || '3fa8dcad-e90f-459a-9a0a-04aef85fc2c4';
                    const clientSecret = selectedNode.data.pluggyClientSecret || '';
                    const bankName = selectedNode.data.bankName || 'Santander Empresas';

                    const handleSavePluggyConfig = async () => {
                      try {
                        const res = await fetch('/api/tools/pluggy/config', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            client_id: clientId,
                            client_secret: clientSecret,
                            bank_name: bankName
                          })
                        });
                        if (res.ok) {
                          setCopiedField('saved_pluggy');
                          setTimeout(() => setCopiedField(null), 3000);
                          testSingleTool(selectedNode);
                        }
                      } catch (e) {
                        console.error(e);
                      }
                    };

                    return (
                      <div className="space-y-3 p-3 bg-[#EFF5F1] rounded-2xl border border-emerald-200/80">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-[#16422B] uppercase tracking-wider flex items-center gap-1">
                            🏦 Open Finance via Pluggy.ai
                          </span>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 whitespace-nowrap shrink-0">
                            API Oficial
                          </span>
                        </div>

                        <div className="p-2.5 bg-white rounded-xl border border-emerald-100 text-[10px] text-gray-600 space-y-1">
                          <div className="font-extrabold text-[#16422B]">Como obter as credenciais Pluggy.ai:</div>
                          <ol className="list-decimal pl-4 space-y-0.5 text-[10px]">
                            <li>Acesse seu painel no <a href="https://dashboard.pluggy.ai" target="_blank" rel="noreferrer" className="text-emerald-700 underline font-bold">dashboard.pluggy.ai</a></li>
                            <li>No menu lateral, acesse <b>API Keys</b> e copie suas chaves</li>
                            <li>Cole o <b>Client ID</b> e <b>Client Secret</b> nos campos abaixo</li>
                            <li>Conecte sua conta PJ ({bankName}) pelo Pluggy Connect</li>
                          </ol>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] font-bold text-[#5A6B61]">Pluggy Client ID:</label>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(clientId, 'pluggy_client_id')}
                              className="text-[9px] font-bold text-gray-600 hover:text-gray-900 flex items-center gap-0.5 cursor-pointer"
                            >
                              <Copy className="w-2.5 h-2.5" />
                              {copiedField === 'pluggy_client_id' ? 'Copiado!' : 'Copiar'}
                            </button>
                          </div>
                          <input
                            type="text"
                            value={clientId}
                            onChange={(e) => updateSelectedNode('pluggyClientId', e.target.value)}
                            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                            className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white focus:outline-none focus:border-[#16422B]"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] font-bold text-[#5A6B61]">Pluggy Client Secret:</label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setShowPluggySecret(!showPluggySecret)}
                                className="text-[9px] font-bold text-gray-500 hover:text-gray-700 flex items-center gap-0.5"
                              >
                                {showPluggySecret ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                                {showPluggySecret ? 'Ocultar' : 'Exibir'}
                              </button>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(clientSecret, 'pluggy_client_secret')}
                                className="text-[9px] font-bold text-gray-600 hover:text-gray-900 flex items-center gap-0.5 cursor-pointer"
                              >
                                <Copy className="w-2.5 h-2.5" />
                                {copiedField === 'pluggy_client_secret' ? 'Copiado!' : 'Copiar'}
                              </button>
                            </div>
                          </div>
                          <input
                            type={showPluggySecret ? 'text' : 'password'}
                            value={clientSecret}
                            onChange={(e) => updateSelectedNode('pluggyClientSecret', e.target.value)}
                            placeholder="••••••••••••••••"
                            className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white focus:outline-none focus:border-[#16422B]"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-[#5A6B61] mb-1">Bancos & Contas Monitoradas:</label>
                          <input
                            type="text"
                            value={bankName}
                            onChange={(e) => updateSelectedNode('bankName', e.target.value)}
                            placeholder="Santander Empresas, Itaú PJ..."
                            className="w-full text-xs font-semibold p-2 border border-[#E2E8E4] rounded-xl bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-[#5A6B61] mb-1">Ambiente Pluggy:</label>
                          <select
                            value={selectedNode.data.pluggyEnv || 'prod'}
                            onChange={(e) => updateSelectedNode('pluggyEnv', e.target.value)}
                            className="w-full text-xs font-semibold p-2 border border-[#E2E8E4] rounded-xl bg-white"
                          >
                            <option value="prod">Produção Oficial (Open Finance Brasil)</option>
                            <option value="sandbox">Sandbox / Testes</option>
                          </select>
                        </div>

                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={handleSavePluggyConfig}
                            className="w-full py-1.5 px-3 text-[10px] font-bold bg-white hover:bg-emerald-50 text-emerald-900 border border-emerald-300 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                          >
                            {copiedField === 'saved_pluggy' ? '✅ Credenciais Open Finance Salvas no Servidor!' : '💾 Sincronizar Credenciais com o Servidor'}
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Bloco Customizado de Business Analytics (analytics.local) */}
                  {(selectedNode.data.type === 'business_analytics' || selectedNode.data.type === 'business' || selectedNode.id === 'tool-business') && (() => {
                    const accessMode = selectedNode.data.accessMode || 'direct_db';
                    const sessionToken = selectedNode.data.sessionToken || '';

                    return (
                      <div className="space-y-3 p-3 bg-[#EFF5F1] rounded-2xl border border-emerald-200/80">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-[#16422B] uppercase tracking-wider flex items-center gap-1.5">
                            📈 Business Analytics AI Board
                          </span>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 whitespace-nowrap shrink-0">
                            Painel Executivo
                          </span>
                        </div>

                        <div className="p-2.5 bg-white rounded-xl border border-rose-100 text-[10px] text-gray-600 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-rose-900">Portal: analytics.local</span>
                            <a
                              href=""
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[9px] font-bold text-emerald-700 hover:text-emerald-900 underline flex items-center gap-0.5"
                            >
                              Abrir Painel ↗
                            </a>
                          </div>
                          <p className="text-[10px] text-gray-600 leading-relaxed">
                            Central executiva de métricas e vendas com histórico completo da operação AI Board.
                          </p>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-[#5A6B61] mb-1">Método de Conexão da Ferramenta:</label>
                          <select
                            value={accessMode}
                            onChange={(e) => updateSelectedNode('accessMode', e.target.value)}
                            className="w-full text-xs font-bold p-2 border border-[#E2E8E4] rounded-xl bg-white text-gray-800 focus:outline-none focus:border-rose-500"
                          >
                            <option value="direct_db">⚡ Base Analítica Local (Recomendado - 0 Latência / 16.741 pedidos)</option>
                            <option value="web_session">🌐 Sessão Web Autenticada (analytics.local)</option>
                          </select>
                        </div>

                        {accessMode === 'direct_db' ? (
                          <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 space-y-1.5 text-[10px]">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 font-bold text-emerald-900">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                Conexão Local Direta Ativa (analytics_store.db)
                              </span>
                              <span className="text-[9px] font-medium px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200 whitespace-nowrap shrink-0">
                                0 Tokens
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 text-gray-600 pt-1">
                              <div className="bg-white p-1.5 rounded-lg border border-emerald-100">
                                <span className="text-[9px] text-gray-500 block">Total de Pedidos</span>
                                <span className="font-bold text-emerald-800 text-xs">16.741 pedidos</span>
                              </div>
                              <div className="bg-white p-1.5 rounded-lg border border-emerald-100">
                                <span className="text-[9px] text-gray-500 block">Itens Vendidos</span>
                                <span className="font-bold text-emerald-800 text-xs">23.117 itens</span>
                              </div>
                              <div className="bg-white p-1.5 rounded-lg border border-emerald-100">
                                <span className="text-[9px] text-gray-500 block">Histórico Coberto</span>
                                <span className="font-bold text-emerald-800 text-[10px]">08/04 até o Presente</span>
                              </div>
                              <div className="bg-white p-1.5 rounded-lg border border-emerald-100">
                                <span className="text-[9px] text-gray-500 block">Tempo de Resposta</span>
                                <span className="font-bold text-emerald-800 text-[10px]">1ms (Instantâneo)</span>
                              </div>
                            </div>
                            <p className="text-[9px] text-emerald-700 italic pt-0.5">
                              ✓ Acesso direto à réplica SQLite do ERP. Respostas instantâneas aos agentes sem necessidade de login no navegador.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2 p-2.5 bg-white rounded-xl border border-[#E2E8E4]">
                            <label className="block text-[10px] font-bold text-[#5A6B61]">Cookie de Sessão Web (_session_token) ou JWT:</label>
                            <input
                              type="password"
                              placeholder="Cole o cookie _session_token gerado pelo login..."
                              value={sessionToken}
                              onChange={(e) => updateSelectedNode('sessionToken', e.target.value)}
                              className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white"
                            />
                            <span className="text-[9px] text-gray-500 block">
                              Utilizado para fazer requisições HTTP simulando usuário logado na interface web.
                            </span>
                          </div>
                        )}

                        <div>
                          <label className="block text-[10px] font-bold text-[#5A6B61] mb-1">Indicadores Disponíveis para os Agentes:</label>
                          <div className="grid grid-cols-2 gap-1.5 text-[10px] text-gray-700">
                            <label className="flex items-center gap-1.5 p-1.5 bg-white rounded-lg border border-[#E2E8E4]">
                              <input type="checkbox" defaultChecked className="rounded text-rose-600" />
                              <span>Faturamento Geral</span>
                            </label>
                            <label className="flex items-center gap-1.5 p-1.5 bg-white rounded-lg border border-[#E2E8E4]">
                              <input type="checkbox" defaultChecked className="rounded text-rose-600" />
                              <span>Canais (iFood / Balcão)</span>
                            </label>
                            <label className="flex items-center gap-1.5 p-1.5 bg-white rounded-lg border border-[#E2E8E4]">
                              <input type="checkbox" defaultChecked className="rounded text-rose-600" />
                              <span>Curva ABC de Bebidas</span>
                            </label>
                            <label className="flex items-center gap-1.5 p-1.5 bg-white rounded-lg border border-[#E2E8E4]">
                              <input type="checkbox" defaultChecked className="rounded text-rose-600" />
                              <span>Horários de Pico</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Bloco Genérico de URL (DRE Gerencial ou sites web externos) */}
                  {(selectedNode.data.type === 'url' || selectedNode.data.type === 'dre') && selectedNode.id !== 'tool-business' && selectedNode.data.type !== 'business_analytics' && selectedNode.data.type !== 'business' && (() => {
                    const defaultUrl = '';
                    const targetUrl = selectedNode.data.url || selectedNode.data.dreUrl || defaultUrl;

                    return (
                      <div className="space-y-3 p-3 bg-gray-50/70 rounded-2xl border border-gray-200">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-gray-800 uppercase tracking-wider flex items-center gap-1">
                            🌐 Conector Web / URL
                          </span>
                          <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200 whitespace-nowrap shrink-0">
                            HTTP/HTTPS
                          </span>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] font-bold text-[#5A6B61]">Endereço Web (URL de Destino):</label>
                            {targetUrl && (
                              <a
                                href={targetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[9px] font-bold text-sky-700 hover:text-sky-900 flex items-center gap-0.5"
                              >
                                Abrir Link ↗
                              </a>
                            )}
                          </div>
                          <input
                            type="text"
                            value={targetUrl}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateSelectedNode('url', val);
                              updateSelectedNode('dreUrl', val);
                            }}
                            placeholder="https://api.empresa.com/relatorio"
                            className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white focus:outline-none focus:border-sky-600"
                          />
                          <span className="text-[9px] text-gray-500 mt-0.5 block">
                            Pode ser um endpoint REST ou qualquer painel interno/externo que o agente precise ler.
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-[#5A6B61] mb-1">Método HTTP:</label>
                            <select
                              value={selectedNode.data.urlMethod || 'GET'}
                              onChange={(e) => updateSelectedNode('urlMethod', e.target.value)}
                              className="w-full text-xs font-semibold p-2 border border-[#E2E8E4] rounded-xl bg-white"
                            >
                              <option value="GET">GET (Leitura / Scraping)</option>
                              <option value="POST">POST (Envio de Dados)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-[#5A6B61] mb-1">Formato de Extração:</label>
                            <select
                              value={selectedNode.data.extractionMode || 'auto'}
                              onChange={(e) => updateSelectedNode('extractionMode', e.target.value)}
                              className="w-full text-xs font-semibold p-2 border border-[#E2E8E4] rounded-xl bg-white"
                            >
                              <option value="auto">Auto (HTML ou JSON)</option>
                              <option value="html">Página Web (Texto Limpo)</option>
                              <option value="json">API REST JSON</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-[#5A6B61] mb-1">Autenticação / Token (Opcional):</label>
                          <input
                            type="password"
                            placeholder="Bearer tok_... ou deixe em branco se público"
                            value={selectedNode.data.urlAuthHeader || ''}
                            onChange={(e) => updateSelectedNode('urlAuthHeader', e.target.value)}
                            className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-[#5A6B61] mb-1">Cache de Resposta:</label>
                          <select
                            value={selectedNode.data.urlCache || '5_minutos'}
                            onChange={(e) => updateSelectedNode('urlCache', e.target.value)}
                            className="w-full text-xs font-semibold p-2 border border-[#E2E8E4] rounded-xl bg-white"
                          >
                            <option value="sem_cache">Sem Cache (Tempo Real)</option>
                            <option value="5_minutos">5 minutos (Recomendado)</option>
                            <option value="1_hora">1 hora</option>
                            <option value="1_dia">1 dia</option>
                          </select>
                        </div>
                      </div>
                    );
                  })()}

                  {selectedNode.data.type === 'generic_mcp' && (
                    <>
                      <div>
                        <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Protocolo / Transporte MCP:</label>
                        <select
                          value={selectedNode.data.mcpTransport || 'sse'}
                          onChange={(e) => updateSelectedNode('mcpTransport', e.target.value)}
                          className="w-full text-xs font-semibold p-2 border border-[#E2E8E4] rounded-xl bg-white"
                        >
                          <option value="sse">SSE (Server-Sent Events) HTTP Remoto</option>
                          <option value="http">HTTP POST / JSON-RPC</option>
                          <option value="stdio">STDIO Processo Local (npx / python)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Endpoint MCP (URL):</label>
                        <input
                          type="text"
                          value={selectedNode.data.endpoint || 'http://127.0.0.1:8999/sse'}
                          onChange={(e) => updateSelectedNode('endpoint', e.target.value)}
                          placeholder="http://127.0.0.1:8999/sse"
                          className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl focus:outline-none focus:border-[#7E5BB5]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Bearer Token / Chave de API:</label>
                        <input
                          type="password"
                          placeholder="Bearer tok_..."
                          value={selectedNode.data.mcpAuthToken || ''}
                          onChange={(e) => updateSelectedNode('mcpAuthToken', e.target.value)}
                          className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl"
                        />
                      </div>
                    </>
                  )}

                  {/* Bloco de Configuração Dedicado: Meta Ads (Facebook & Instagram) */}
                  {selectedNode.data.type === 'meta_ads' && (() => {
                    const accountId = selectedNode.data.metaAccountId || selectedNode.data.adAccountId || '';
                    const accessToken = selectedNode.data.metaAccessToken || selectedNode.data.accessToken || '';
                    const appId = selectedNode.data.metaAppId || selectedNode.data.appId || '';
                    const appSecret = selectedNode.data.metaAppSecret || selectedNode.data.appSecret || '';
                    const pixelId = selectedNode.data.metaPixelId || selectedNode.data.pixelId || '';
                    const connMode = selectedNode.data.connectionMode || 'graph_api';
                    const endpoint = selectedNode.data.endpoint || 'http://127.0.0.1:8998/sse';

                    const handleSaveMetaConfig = async () => {
                      try {
                        const res = await fetch('/api/tools/meta-ads/config', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            ad_account_id: accountId,
                            access_token: accessToken,
                            app_id: appId,
                            app_secret: appSecret,
                            pixel_id: pixelId,
                            connection_mode: connMode,
                            endpoint: endpoint
                          })
                        });
                        if (res.ok) {
                          setCopiedField('saved_meta_ads');
                          setTimeout(() => setCopiedField(null), 3000);
                          testSingleTool(selectedNode);
                        }
                      } catch (e) {
                        console.error('Erro ao salvar credenciais Meta Ads:', e);
                      }
                    };

                    return (
                      <div className="space-y-3.5 p-3.5 bg-blue-50/50 rounded-2xl border border-blue-200">
                        <div className="flex items-center justify-between pb-2 border-b border-blue-200/60">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-[#1877F2] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                              f
                            </div>
                            <div>
                              <div className="text-[11px] font-black text-blue-950 uppercase tracking-wider">
                                Meta Ads (Facebook & Instagram)
                              </div>
                              <div className="text-[9px] text-blue-700 font-semibold">
                                Marketing API v19.0 & Insights
                              </div>
                            </div>
                          </div>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 whitespace-nowrap shrink-0">
                            Graph API
                          </span>
                        </div>

                        <div className="text-[11px] text-blue-900 leading-relaxed bg-white/80 p-2.5 rounded-xl border border-blue-100">
                          <p className="font-semibold mb-1">Como obter os dados de acesso da Meta:</p>
                          <ol className="list-decimal pl-4 space-y-0.5 text-[10px] text-gray-700">
                            <li>Acesse seu <a href="https://adsmanager.facebook.com" target="_blank" rel="noreferrer" className="text-blue-600 underline font-bold">Gerenciador de Anúncios</a> para copiar o <strong>ID da Conta</strong>.</li>
                            <li>Gere um <strong>Token de Usuário do Sistema</strong> no <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noreferrer" className="text-blue-600 underline font-bold">Meta Business Suite</a>.</li>
                            <li>Permissões recomendadas: <code className="font-mono bg-blue-50 px-1 py-0.2 rounded text-blue-900">ads_read, read_insights</code>.</li>
                          </ol>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Modo de Conexão:</label>
                          <select
                            value={connMode}
                            onChange={(e) => updateSelectedNode('connectionMode', e.target.value)}
                            className="w-full text-xs font-semibold p-2 border border-[#E2E8E4] rounded-xl bg-white"
                          >
                            <option value="graph_api">Graph API Oficial v19.0 (Recomendado - Direto)</option>
                            <option value="mcp">Servidor MCP Local (SSE / HTTP)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">ID da Conta de Anúncios (Ad Account ID):</label>
                          <input
                            type="text"
                            value={accountId}
                            onChange={(e) => {
                              updateSelectedNode('metaAccountId', e.target.value);
                              updateSelectedNode('adAccountId', e.target.value);
                            }}
                            placeholder="act_123456789012345"
                            className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white focus:outline-none focus:border-blue-600"
                          />
                          <span className="text-[9px] text-gray-500 mt-0.5 block">
                            Formato: <code className="font-mono">act_...</code> ou apenas o ID numérico.
                          </span>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-bold text-[#5A6B61]">Token de Acesso (Access Token):</label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setShowMetaSecret(!showMetaSecret)}
                                className="text-[9px] font-bold text-gray-500 hover:text-gray-700 flex items-center gap-0.5"
                              >
                                {showMetaSecret ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                                {showMetaSecret ? 'Ocultar' : 'Exibir'}
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const text = await navigator.clipboard.readText();
                                    if (text) {
                                      updateSelectedNode('metaAccessToken', text);
                                      updateSelectedNode('accessToken', text);
                                    }
                                  } catch (e) {}
                                }}
                                className="text-[9px] font-bold text-blue-700 hover:text-blue-900"
                              >
                                Colar
                              </button>
                            </div>
                          </div>
                          <input
                            type={showMetaSecret ? 'text' : 'password'}
                            value={accessToken}
                            onChange={(e) => {
                              updateSelectedNode('metaAccessToken', e.target.value);
                              updateSelectedNode('accessToken', e.target.value);
                            }}
                            placeholder="EAAB... (User ou System Token)"
                            className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white focus:outline-none focus:border-blue-600"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-[#5A6B61] mb-1">App ID (Opcional):</label>
                            <input
                              type="text"
                              value={appId}
                              onChange={(e) => {
                                updateSelectedNode('metaAppId', e.target.value);
                                updateSelectedNode('appId', e.target.value);
                              }}
                              placeholder="123456789..."
                              className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-[#5A6B61] mb-1">Pixel ID (Opcional):</label>
                            <input
                              type="text"
                              value={pixelId}
                              onChange={(e) => {
                                updateSelectedNode('metaPixelId', e.target.value);
                                updateSelectedNode('pixelId', e.target.value);
                              }}
                              placeholder="987654321..."
                              className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white"
                            />
                          </div>
                        </div>

                        {connMode === 'mcp' && (
                          <div>
                            <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Endpoint MCP Meta Ads:</label>
                            <input
                              type="text"
                              value={endpoint}
                              onChange={(e) => updateSelectedNode('endpoint', e.target.value)}
                              placeholder="http://127.0.0.1:8998/sse"
                              className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white"
                            />
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={handleSaveMetaConfig}
                          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {copiedField === 'saved_meta_ads' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-white" />
                              <span>Credenciais Salvas & Testadas!</span>
                            </>
                          ) : (
                            <>
                              <span>💾 Salvar Credenciais da Meta no Servidor</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })()}

                  {/* Bloco de Configuração Dedicado: Google Ads */}
                  {selectedNode.data.type === 'google_ads' && (() => {
                    const customerId = selectedNode.data.googleCustomerId || selectedNode.data.customerId || '';
                    const devToken = selectedNode.data.googleDeveloperToken || selectedNode.data.developerToken || '';
                    const clientId = selectedNode.data.googleClientId || selectedNode.data.clientId || '';
                    const clientSecret = selectedNode.data.googleClientSecret || selectedNode.data.clientSecret || '';
                    const refreshToken = selectedNode.data.googleRefreshToken || selectedNode.data.refreshToken || '';
                    const connMode = selectedNode.data.connectionMode || 'google_api';
                    const endpoint = selectedNode.data.endpoint || 'http://127.0.0.1:8997/sse';

                    const handleSaveGoogleConfig = async () => {
                      try {
                        const res = await fetch('/api/tools/google-ads/config', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            customer_id: customerId,
                            developer_token: devToken,
                            client_id: clientId,
                            client_secret: clientSecret,
                            refresh_token: refreshToken,
                            connection_mode: connMode,
                            endpoint: endpoint
                          })
                        });
                        if (res.ok) {
                          setCopiedField('saved_google_ads');
                          setTimeout(() => setCopiedField(null), 3000);
                          testSingleTool(selectedNode);
                        }
                      } catch (e) {
                        console.error('Erro ao salvar credenciais Google Ads:', e);
                      }
                    };

                    return (
                      <div className="space-y-3.5 p-3.5 bg-gray-50/80 rounded-2xl border border-gray-200">
                        <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-[#4285F4] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                              G
                            </div>
                            <div>
                              <div className="text-[11px] font-black text-gray-900 uppercase tracking-wider">
                                Google Ads (Pesquisa & PMax)
                              </div>
                              <div className="text-[9px] text-gray-500 font-semibold">
                                Google Ads API v16 & OAuth 2.0
                              </div>
                            </div>
                          </div>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200 whitespace-nowrap shrink-0">
                            REST API
                          </span>
                        </div>

                        <div className="text-[11px] text-gray-800 leading-relaxed bg-white p-2.5 rounded-xl border border-gray-200">
                          <p className="font-semibold mb-1">Como obter os dados de acesso do Google Ads:</p>
                          <ol className="list-decimal pl-4 space-y-0.5 text-[10px] text-gray-600">
                            <li>Copie seu <strong>Customer ID</strong> (10 dígitos) no painel do <a href="https://ads.google.com" target="_blank" rel="noreferrer" className="text-blue-600 underline font-bold">Google Ads</a>.</li>
                            <li>Obtenha o <strong>Developer Token</strong> na sua conta de Administrador (MCC).</li>
                            <li>Gere as credenciais OAuth 2.0 no <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-blue-600 underline font-bold">Google Cloud Console</a>.</li>
                          </ol>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Modo de Conexão:</label>
                          <select
                            value={connMode}
                            onChange={(e) => updateSelectedNode('connectionMode', e.target.value)}
                            className="w-full text-xs font-semibold p-2 border border-[#E2E8E4] rounded-xl bg-white"
                          >
                            <option value="google_api">Google Ads API Oficial (OAuth 2.0 - Recomendado)</option>
                            <option value="mcp">Servidor MCP Local (SSE / HTTP)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">ID do Cliente Google Ads (Customer ID):</label>
                          <input
                            type="text"
                            value={customerId}
                            onChange={(e) => {
                              updateSelectedNode('googleCustomerId', e.target.value);
                              updateSelectedNode('customerId', e.target.value);
                            }}
                            placeholder="123-456-7890 ou 1234567890"
                            className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white focus:outline-none focus:border-[#16422B]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Developer Token (MCC Google Ads):</label>
                          <input
                            type="password"
                            value={devToken}
                            onChange={(e) => {
                              updateSelectedNode('googleDeveloperToken', e.target.value);
                              updateSelectedNode('developerToken', e.target.value);
                            }}
                            placeholder="Token de Desenvolvedor da Conta MCC"
                            className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white focus:outline-none focus:border-[#16422B]"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-[#5A6B61] mb-1">Client ID (OAuth):</label>
                            <input
                              type="text"
                              value={clientId}
                              onChange={(e) => {
                                updateSelectedNode('googleClientId', e.target.value);
                                updateSelectedNode('clientId', e.target.value);
                              }}
                              placeholder="...apps.googleusercontent.com"
                              className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white"
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[10px] font-bold text-[#5A6B61]">Client Secret:</label>
                              <button
                                type="button"
                                onClick={() => setShowGoogleSecret(!showGoogleSecret)}
                                className="text-[8px] font-bold text-gray-500 hover:text-gray-700"
                              >
                                {showGoogleSecret ? 'Ocultar' : 'Exibir'}
                              </button>
                            </div>
                            <input
                              type={showGoogleSecret ? 'text' : 'password'}
                              value={clientSecret}
                              onChange={(e) => {
                                updateSelectedNode('googleClientSecret', e.target.value);
                                updateSelectedNode('clientSecret', e.target.value);
                              }}
                              placeholder="GOCSPX-..."
                              className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white"
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-bold text-[#5A6B61]">Refresh Token OAuth:</label>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const text = await navigator.clipboard.readText();
                                  if (text) {
                                    updateSelectedNode('googleRefreshToken', text);
                                    updateSelectedNode('refreshToken', text);
                                  }
                                } catch (e) {}
                              }}
                              className="text-[9px] font-bold text-amber-700 hover:text-amber-900"
                            >
                              Colar Token
                            </button>
                          </div>
                          <input
                            type="password"
                            value={refreshToken}
                            onChange={(e) => {
                              updateSelectedNode('googleRefreshToken', e.target.value);
                              updateSelectedNode('refreshToken', e.target.value);
                            }}
                            placeholder="1//04... (OAuth Refresh Token)"
                            className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white focus:outline-none focus:border-[#16422B]"
                          />
                        </div>

                        {connMode === 'mcp' && (
                          <div>
                            <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">Endpoint MCP Google Ads:</label>
                            <input
                              type="text"
                              value={endpoint}
                              onChange={(e) => updateSelectedNode('endpoint', e.target.value)}
                              placeholder="http://127.0.0.1:8997/sse"
                              className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white"
                            />
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={handleSaveGoogleConfig}
                          className="w-full py-2.5 bg-[#16422B] hover:bg-[#123522] text-white font-bold text-xs rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {copiedField === 'saved_google_ads' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-white" />
                              <span>Credenciais Salvas & Testadas!</span>
                            </>
                          ) : (
                            <>
                              <span>💾 Salvar Credenciais do Google no Servidor</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })()}

                  {(selectedNode.data.type === 'marqhr' || selectedNode.data.type === 'marq') && (() => {
                    const email = selectedNode.data.marqEmail || selectedNode.data.email || '';
                    const password = selectedNode.data.marqPassword || selectedNode.data.password || '';
                    const companyId = selectedNode.data.marqCompanyId || '';
                    const apiUrl = selectedNode.data.marqApiUrl || 'https://api.marqhr.com.br';
                    const apiToken = selectedNode.data.marqApiToken || selectedNode.data.token || '';

                    return (
                      <>
                        <div className="p-3 bg-[#EFF5F1] border border-emerald-200/80 rounded-2xl text-xs space-y-2">
                          <div className="flex items-center justify-between pb-1.5 border-b border-emerald-200/60">
                            <span className="font-extrabold text-[#16422B] flex items-center gap-1.5">
                              <Clock className="w-4 h-4 text-[#16422B]" />
                              MarQ HR (Ponto Eletrônico & Gestão)
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 whitespace-nowrap shrink-0">
                              app.marqhr.com
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-700 leading-relaxed">
                            Integração oficial para o <b>Auditor de DP & Rotinas Trabalhistas</b>. Permite auditoria de espelho de ponto, batidas diárias, horas extras, faltas, atestados e colaboradores da AI Board.
                          </p>
                          <div className="p-2 bg-white/80 border border-emerald-200 rounded-xl text-[10px] text-emerald-900 font-medium flex items-center gap-1.5">
                            <span className="text-emerald-600 font-bold">✓</span>
                            <span>Autenticação direta por <b>E-mail e Senha</b> habilitada (sem custo adicional de API).</span>
                          </div>
                        </div>

                        <div className="space-y-3 pt-1">
                          <div>
                            <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                              Usuário / E-mail de Acesso (MarQ HR):
                            </label>
                            <input
                              type="email"
                              value={email}
                              onChange={(e) => {
                                updateSelectedNode('marqEmail', e.target.value);
                                updateSelectedNode('email', e.target.value);
                              }}
                              placeholder="ponto@empresa.com"
                              className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white focus:outline-none focus:border-[#16422B]"
                            />
                            <p className="text-[9px] text-gray-500 mt-1">
                              E-mail do administrador ou gestor cadastrado em app.marqhr.com.
                            </p>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[11px] font-bold text-[#5A6B61]">
                                Senha de Acesso:
                              </label>
                              <button
                                type="button"
                                onClick={() => setShowMarqSecret(!showMarqSecret)}
                                className="text-[9px] font-bold text-emerald-700 hover:text-emerald-900 cursor-pointer"
                              >
                                {showMarqSecret ? 'Ocultar' : 'Exibir'}
                              </button>
                            </div>
                            <input
                              type={showMarqSecret ? 'text' : 'password'}
                              value={password}
                              onChange={(e) => {
                                updateSelectedNode('marqPassword', e.target.value);
                                updateSelectedNode('password', e.target.value);
                              }}
                              placeholder="••••••••••••"
                              className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white focus:outline-none focus:border-[#16422B]"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                              ID da Empresa / Filial (Opcional):
                            </label>
                            <input
                              type="text"
                              value={companyId}
                              onChange={(e) => updateSelectedNode('marqCompanyId', e.target.value)}
                              placeholder="Preenchido automaticamente após login (ex: E0E94D4EF...)"
                              className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white focus:outline-none focus:border-[#16422B]"
                            />
                            <p className="text-[9px] text-gray-500 mt-1">
                              Identificador único da empresa AI Board extraído automaticamente pelo conector.
                            </p>
                          </div>

                          <details className="text-[11px] text-gray-600 border border-gray-200 rounded-xl p-2 bg-gray-50/50">
                            <summary className="font-bold text-gray-700 cursor-pointer hover:text-gray-900">
                              Configurações Avançadas (URL / Token API Legado)
                            </summary>
                            <div className="space-y-2 mt-2 pt-2 border-t border-gray-200">
                              <div>
                                <label className="block text-[10px] font-bold text-gray-600 mb-0.5">
                                  URL Base da API:
                                </label>
                                <input
                                  type="text"
                                  value={apiUrl}
                                  onChange={(e) => updateSelectedNode('marqApiUrl', e.target.value)}
                                  placeholder="https://api.marqhr.com.br"
                                  className="w-full text-xs font-mono p-1.5 border border-[#E2E8E4] rounded-lg bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-gray-600 mb-0.5">
                                  Token de API (Opcional):
                                </label>
                                <input
                                  type="password"
                                  value={apiToken}
                                  onChange={(e) => updateSelectedNode('marqApiToken', e.target.value)}
                                  placeholder="Chave de API se disponível"
                                  className="w-full text-xs font-mono p-1.5 border border-[#E2E8E4] rounded-lg bg-white"
                                />
                              </div>
                            </div>
                          </details>

                          <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl space-y-1.5">
                            <span className="text-[10px] font-bold text-gray-700 block uppercase tracking-wider">
                              ⚡ Módulos Habilitados para a Crew
                            </span>
                            <div className="grid grid-cols-2 gap-1 text-[10px]">
                              <div className="p-1.5 bg-white rounded-lg border border-gray-100 flex items-center gap-1 font-medium text-gray-700">
                                ⏱️ Espelho de Ponto
                              </div>
                              <div className="p-1.5 bg-white rounded-lg border border-gray-100 flex items-center gap-1 font-medium text-gray-700">
                                🚨 Auditoria Horas Extras
                              </div>
                              <div className="p-1.5 bg-white rounded-lg border border-gray-100 flex items-center gap-1 font-medium text-gray-700">
                                👥 Quadro de Pessoal
                              </div>
                              <div className="p-1.5 bg-white rounded-lg border border-gray-100 flex items-center gap-1 font-medium text-gray-700">
                                🏖️ Faltas & Atestados
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  {(selectedNode.data.type === 'intranetmall' || selectedNode.data.type === 'mall' || selectedNode.data.type === 'intranet') && (() => {
                    const username = selectedNode.data.mallUsername || selectedNode.data.username || 'LOJ001';
                    const password = selectedNode.data.mallPassword || selectedNode.data.password || '';
                    const url = selectedNode.data.mallUrl || 'https://app3.intranetmall.com/loja/';
                    const storeName = selectedNode.data.mallStoreName || 'Loja Matriz (LOJ001) - Shopping';

                    return (
                      <>
                        <div className="p-3 bg-[#EFF5F1] border border-emerald-200/80 rounded-2xl text-xs space-y-2">
                          <div className="flex items-center justify-between pb-1.5 border-b border-emerald-200/60">
                            <span className="font-extrabold text-[#16422B] flex items-center gap-1.5">
                              <Building2 className="w-4 h-4 text-[#16422B]" />
                              Intranet Mall (Shopping Center)
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 whitespace-nowrap shrink-0">
                              app3.intranetmall.com
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-700 leading-relaxed">
                            Portal oficial do condomínio e administração do <b>Shopping Center</b> para a loja AI Board. Permite consulta de boletos e faturas mensais, histórico de vendas brutas reportadas e circulares do shopping.
                          </p>
                          <div className="p-2 bg-white/80 border border-emerald-200 rounded-xl text-[10px] text-emerald-900 font-medium flex items-center gap-1.5">
                            <span className="text-emerald-600 font-bold">✓</span>
                            <span>Autenticação direta com suporte a reCAPTCHA v3 e monitoramento operacional.</span>
                          </div>
                        </div>

                        <div className="space-y-3 pt-1">
                          <div>
                            <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                              Usuário / Código da Loja:
                            </label>
                            <input
                              type="text"
                              value={username}
                              onChange={(e) => {
                                updateSelectedNode('mallUsername', e.target.value);
                                updateSelectedNode('username', e.target.value);
                              }}
                              placeholder="LOJ001"
                              className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white focus:outline-none focus:border-[#16422B]"
                            />
                            <p className="text-[9px] text-gray-500 mt-1">
                              Código de lojista cadastrado na administração Allos / Shopping Center.
                            </p>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[11px] font-bold text-[#5A6B61]">
                                Senha de Acesso:
                              </label>
                              <button
                                type="button"
                                onClick={() => setShowMallSecret(!showMallSecret)}
                                className="text-[9px] font-bold text-gray-600 hover:text-gray-900 cursor-pointer"
                              >
                                {showMallSecret ? 'Ocultar' : 'Exibir'}
                              </button>
                            </div>
                            <input
                              type={showMallSecret ? 'text' : 'password'}
                              value={password}
                              onChange={(e) => {
                                updateSelectedNode('mallPassword', e.target.value);
                                updateSelectedNode('password', e.target.value);
                              }}
                              placeholder="••••••••••••"
                              className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white focus:outline-none focus:border-[#16422B]"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                              Identificação da Loja:
                            </label>
                            <input
                              type="text"
                              value={storeName}
                              onChange={(e) => updateSelectedNode('mallStoreName', e.target.value)}
                              placeholder="Loja Matriz (LOJ001) - Shopping"
                              className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white focus:outline-none focus:border-[#16422B]"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-[#5A6B61] mb-1">
                              URL da Intranet:
                            </label>
                            <input
                              type="text"
                              value={url}
                              onChange={(e) => updateSelectedNode('mallUrl', e.target.value)}
                              placeholder="https://app3.intranetmall.com/loja/"
                              className="w-full text-xs font-mono p-2 border border-[#E2E8E4] rounded-xl bg-white focus:outline-none focus:border-[#16422B]"
                            />
                          </div>

                          <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl space-y-1.5">
                            <span className="text-[10px] font-bold text-gray-700 block uppercase tracking-wider">
                              ⚡ Módulos Habilitados para a Crew
                            </span>
                            <div className="grid grid-cols-2 gap-1 text-[10px]">
                              <div className="p-1.5 bg-white rounded-lg border border-gray-100 flex items-center gap-1 font-medium text-gray-700">
                                🏢 Boletos & Faturas
                              </div>
                              <div className="p-1.5 bg-white rounded-lg border border-gray-100 flex items-center gap-1 font-medium text-gray-700">
                                📊 Lançamento de Vendas
                              </div>
                              <div className="p-1.5 bg-white rounded-lg border border-gray-100 flex items-center gap-1 font-medium text-gray-700">
                                📜 Circulares & Avisos
                              </div>
                              <div className="p-1.5 bg-white rounded-lg border border-gray-100 flex items-center gap-1 font-medium text-gray-700">
                                👷 Ordens de Serviço & Obras
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-[#E2E8E4] flex items-center gap-2">
            {isAdmin ? (
              <>
                <button
                  onClick={async () => {
                    const nodeName = selectedNode.data?.name || selectedNode.id;
                    if (window.confirm(t('studio.confirmRemoveBlock', { name: nodeName }))) {
                      const id = selectedNode.id;
                      setSelectedNode(null);
                      const nextNodes = nodes.filter((n) => n.id !== id);
                      const nextEdges = edges.filter((e) => e.source !== id && e.target !== id);
                      setNodes(nextNodes);
                      setEdges(nextEdges);
                      pushHistory(nextNodes, nextEdges);
                      await handleSave(nextNodes, nextEdges);
                    }
                  }}
                  className="p-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition cursor-pointer shrink-0"
                  title={t('studio.removeBlockTooltip')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <button
                  onClick={async () => {
                    pushHistory(nodes, edges);
                    setSelectedNode(null);
                    await handleSave(nodes, edges);
                  }}
                  className="flex-1 py-2.5 bg-[#16422B] text-white text-xs font-bold rounded-xl hover:bg-[#2B6143] transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer truncate"
                >
                  <Save className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{t('studio.finishAndSave')}</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => setSelectedNode(null)}
                className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl transition"
              >
                {t('studio.closeView')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modal de Agendamento de Tarefa (CRON) */}
      {showAddCronModal && selectedNode && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white border border-[#E2E8E4] rounded-3xl p-6 shadow-2xl w-full max-w-md space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8E4]">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600 shrink-0" />
                <h3 className="font-extrabold text-sm text-[#16422B]">
                  {t('studio.scheduleModalTitle')}
                </h3>
              </div>
              <button
                onClick={() => setShowAddCronModal(false)}
                className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-500 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newCronTask.title.trim()) return;
                const newTask = {
                  id: `cron-${Date.now()}`,
                  title: newCronTask.title.trim(),
                  frequency: newCronTask.frequency,
                  cron: newCronTask.cron,
                  instruction: newCronTask.instruction.trim() || 'Executar rotina programada do agente.',
                  active: true
                };
                const existing = selectedNode.data.scheduledTasks || [];
                const updated = [...existing, newTask];
                updateSelectedNode('scheduledTasks', updated);
                pushHistory(nodes, edges);
                setShowAddCronModal(false);
                setNewCronTask({
                  title: '',
                  frequency: 'Diário às 22:00 BRT',
                  cron: '0 22 * * *',
                  instruction: ''
                });
              }}
              className="space-y-3.5"
            >
              <div>
                <label className="block text-xs font-bold text-[#5A6B61] mb-1">
                  {t('studio.taskTitleLabel')}
                </label>
                <input
                  type="text"
                  required
                  placeholder={t('studio.taskTitlePlaceholder')}
                  value={newCronTask.title}
                  onChange={(e) => setNewCronTask({ ...newCronTask, title: e.target.value })}
                  className="w-full text-xs font-semibold p-2.5 border border-[#E2E8E4] rounded-xl focus:outline-none focus:border-[#16422B]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#5A6B61] mb-1">
                  {t('studio.frequencyAndTime')}
                </label>
                <select
                  value={newCronTask.cron}
                  onChange={(e) => {
                    const val = e.target.value;
                    let label = 'Customizado';
                    if (val === '0 22 * * *') label = 'Diariamente às 22:00 BRT';
                    else if (val === '0 9 * * *') label = 'Diariamente às 09:00 BRT';
                    else if (val === '30 8 * * 1-5') label = 'Seg a Sex às 08:30 BRT';
                    else if (val === '0 */2 * * *') label = 'A cada 2 horas';
                    else if (val === '0 * * * *') label = 'A cada hora';
                    else if (val === '0 8 * * 1') label = 'Toda Segunda às 08:00 BRT';
                    setNewCronTask({ ...newCronTask, cron: val, frequency: label });
                  }}
                  className="w-full text-xs font-semibold p-2.5 border border-[#E2E8E4] rounded-xl bg-white focus:outline-none focus:border-[#16422B]"
                >
                  <option value="0 22 * * *">⏰ Diariamente às 22:00 BRT (Fechamento)</option>
                  <option value="0 9 * * *">☀️ Diariamente às 09:00 BRT (Abertura)</option>
                  <option value="30 8 * * 1-5">📅 Segunda a Sexta às 08:30 BRT</option>
                  <option value="0 */2 * * *">⏱️ A cada 2 horas</option>
                  <option value="0 * * * *">⚡ A cada 1 hora</option>
                  <option value="0 8 * * 1">🗓️ Semanal (Segunda-feira às 08:00 BRT)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#5A6B61] mb-1">
                  {t('studio.cronExpression')}
                </label>
                <input
                  type="text"
                  required
                  value={newCronTask.cron}
                  onChange={(e) => setNewCronTask({ ...newCronTask, cron: e.target.value })}
                  className="w-full text-xs font-mono p-2.5 border border-[#E2E8E4] rounded-xl focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#5A6B61] mb-1">
                  {t('studio.taskInstructionLabel')}
                </label>
                <textarea
                  rows={3}
                  placeholder={t('studio.taskInstructionPlaceholder')}
                  value={newCronTask.instruction}
                  onChange={(e) => setNewCronTask({ ...newCronTask, instruction: e.target.value })}
                  className="w-full text-xs p-2.5 border border-[#E2E8E4] rounded-xl focus:outline-none focus:border-[#16422B]"
                />
              </div>

              <div className="pt-3 border-t border-[#E2E8E4] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddCronModal(false)}
                  className="px-4 py-2 text-xs font-bold text-[#5A6B61] hover:bg-gray-100 rounded-xl transition cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{t('studio.saveCronSchedule')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal de Confirmação de Otimização de Custos */}
      {optimizationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in font-sans">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-[#E2E8E4] space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8E4] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                  <Sparkles className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#16422B]">Otimização de Custos de IA Concluída</h3>
                  <p className="text-[11px] text-[#5A6B61]">Modelos balanceados por complexidade de trabalho</p>
                </div>
              </div>
              <button
                onClick={() => setOptimizationModal(null)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl text-emerald-950 flex items-center justify-between">
                <div>
                  <div className="font-extrabold text-xs">Economia Média Projetada:</div>
                  <div className="text-[11px] text-emerald-800">Redução de custo de tokens por consulta/rotina</div>
                </div>
                <div className="text-2xl font-black text-emerald-700 font-mono">~{optimizationModal.avgSavings}</div>
              </div>

              <div className="space-y-2 pt-1">
                <div className="p-2.5 rounded-xl border border-gray-200 bg-gray-50/70 flex items-start justify-between gap-2">
                  <div>
                    <div className="font-extrabold text-[#16422B] flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      Tier 1: Gemini 3.1 Flash-Lite
                    </div>
                    <div className="text-[11px] text-gray-600 mt-0.5">
                      Estoque, POPs, SAC/Chatwoot e Treinamentos (Consultas e triagens repetitivas)
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md text-[10px]">
                      {optimizationModal.tier1} agentes
                    </span>
                    <div className="text-[10px] text-gray-500 font-mono mt-0.5">US$ 0.25 / 1M in</div>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl border border-gray-200 bg-gray-50/70 flex items-start justify-between gap-2">
                  <div>
                    <div className="font-extrabold text-[#16422B] flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                      Tier 2: Gemini 3.5 Flash-Lite
                    </div>
                    <div className="text-[11px] text-gray-600 mt-0.5">
                      Contas a Pagar, Anúncios Ads e DP (Conferência de dados semi-estruturados)
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-md text-[10px]">
                      {optimizationModal.tier2} agentes
                    </span>
                    <div className="text-[10px] text-gray-500 font-mono mt-0.5">US$ 0.30 / 1M in</div>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl border border-gray-200 bg-gray-50/70 flex items-start justify-between gap-2">
                  <div>
                    <div className="font-extrabold text-[#16422B] flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      Tier 3: Gemini 3.8 Flash
                    </div>
                    <div className="text-[11px] text-gray-600 mt-0.5">
                      CEO, CFO, COO, CMO, CPO, DRE e Copywriter (Coordenação executiva e criatividade)
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md text-[10px]">
                      {optimizationModal.tier3} agentes
                    </span>
                    <div className="text-[10px] text-gray-500 font-mono mt-0.5">US$ 0.75 / 1M in</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#E2E8E4] flex items-center justify-between">
              <span className="text-[11px] text-[#5A6B61]">
                Total de <strong className="text-gray-900">{optimizationModal.total} agentes</strong> reconfigurados e salvos no Studio.
              </span>
              <button
                onClick={() => setOptimizationModal(null)}
                className="px-4 py-2 bg-[#16422B] hover:bg-[#2B6143] text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
              >
                Concluir & Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Logs em Tempo Real / Terminal da Tarefa Ativa */}
      <TaskLiveModal
        taskId={liveTaskId}
        isOpen={!!liveTaskId}
        onClose={() => setLiveTaskId(null)}
        user={user}
      />
    </div>
  );
}
