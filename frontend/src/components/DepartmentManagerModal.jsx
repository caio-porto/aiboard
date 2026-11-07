import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Edit2,
  Check,
  Palette,
  Layers,
  CircleDollarSign,
  Megaphone,
  Users,
  Cpu,
  ShieldCheck,
  Building2,
  Landmark,
  Truck,
  ShoppingCart,
  Headphones,
  Sparkles,
  Scale,
  HeartHandshake
} from 'lucide-react';

import { useLanguage } from '../i18n';

export const DEFAULT_DEPARTMENTS = [
  { id: 'ceo', name: 'Central Executiva & Estratégia', color: '#D97706', icon: 'Sparkles' },
  { id: 'cfo', name: 'Financeiro & Controladoria', color: '#059669', icon: 'CircleDollarSign' },
  { id: 'coo', name: 'Operações & Lojas', color: '#2563EB', icon: 'Layers' },
  { id: 'cmo', name: 'Marketing, Marca & Growth', color: '#7C3AED', icon: 'Megaphone' },
  { id: 'cpo', name: 'Gente & Cultura (RH)', color: '#E11D48', icon: 'Users' },
  { id: 'ti', name: 'Tecnologia & Inovação', color: '#4F46E5', icon: 'Cpu' },
  { id: 'logistica', name: 'Logística & Suprimentos', color: '#0D9488', icon: 'Truck' }
];

export const PRESET_COLORS = [
  { hex: '#059669', name: 'Esmeralda' },
  { hex: '#2563EB', name: 'Azul Safira' },
  { hex: '#7C3AED', name: 'Roxo Real' },
  { hex: '#E11D48', name: 'Rose Vibrante' },
  { hex: '#D97706', name: 'Âmbar / Ouro' },
  { hex: '#0D9488', name: 'Teal Petróleo' },
  { hex: '#4F46E5', name: 'Índigo' },
  { hex: '#EA580C', name: 'Laranja Coral' },
  { hex: '#0284C7', name: 'Azul Céu' },
  { hex: '#475569', name: 'Grafite Corporativo' }
];

export const ICON_OPTIONS = [
  { id: 'Sparkles', icon: Sparkles, label: 'Estratégia' },
  { id: 'CircleDollarSign', icon: CircleDollarSign, label: 'Financeiro' },
  { id: 'Layers', icon: Layers, label: 'Operações' },
  { id: 'Megaphone', icon: Megaphone, label: 'Marketing' },
  { id: 'Users', icon: Users, label: 'Pessoas / RH' },
  { id: 'Cpu', icon: Cpu, label: 'Tecnologia' },
  { id: 'Truck', icon: Truck, label: 'Logística' },
  { id: 'Building2', icon: Building2, label: 'Lojas / Expansão' },
  { id: 'Landmark', icon: Landmark, label: 'Bancos' },
  { id: 'ShieldCheck', icon: ShieldCheck, label: 'Auditoria' },
  { id: 'Headphones', icon: Headphones, label: 'SAC' },
  { id: 'Scale', icon: Scale, label: 'Jurídico' },
  { id: 'HeartHandshake', icon: HeartHandshake, label: 'Parcerias' },
  { id: 'ShoppingCart', icon: ShoppingCart, label: 'Vendas' }
];

export function DepartmentManagerModal({
  isOpen,
  departments,
  onClose,
  onSaveDepartments
}) {
  const { t, tr } = useLanguage();
  const [deptList, setDeptList] = useState(() => departments || DEFAULT_DEPARTMENTS);
  const [editingId, setEditingId] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState('#2563EB');
  const [formIcon, setFormIcon] = useState('Layers');

  if (!isOpen) return null;

  const handleStartAdd = () => {
    setIsAddingNew(true);
    setEditingId(null);
    setFormName('');
    setFormColor('#2563EB');
    setFormIcon('Layers');
  };

  const handleStartEdit = (dept) => {
    setEditingId(dept.id);
    setIsAddingNew(false);
    setFormName(dept.name);
    setFormColor(dept.color || '#2563EB');
    setFormIcon(dept.icon || 'Layers');
  };

  const handleSaveItem = () => {
    if (!formName.trim()) return;
    if (isAddingNew) {
      const slug = formName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      const newDept = {
        id: slug || `dept_${Date.now()}`,
        name: formName.trim(),
        color: formColor,
        icon: formIcon
      };
      const next = [...deptList, newDept];
      setDeptList(next);
      onSaveDepartments(next);
      setIsAddingNew(false);
    } else if (editingId) {
      const next = deptList.map((d) =>
        d.id === editingId
          ? { ...d, name: formName.trim(), color: formColor, icon: formIcon }
          : d
      );
      setDeptList(next);
      onSaveDepartments(next);
      setEditingId(null);
    }
  };

  const handleDelete = (id) => {
    if (confirm(t('departments.confirmRemove'))) {
      const next = deptList.filter((d) => d.id !== id);
      setDeptList(next);
      onSaveDepartments(next);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-[#E2E8E4] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Topo */}
        <div className="p-4 sm:p-5 border-b border-[#E2E8E4] flex items-center justify-between bg-gradient-to-r from-gray-50 to-white gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-2xl bg-blue-50 text-blue-700 shrink-0">
              <Palette className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-[#16422B] truncate">
                {t('departments.title')}
              </h2>
              <p className="text-xs text-[#5A6B61] truncate">
                {t('departments.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-5 overflow-y-auto max-h-[60vh] space-y-4 bg-gray-50/50">
          {/* Formulário de Adicionar / Editar */}
          {(isAddingNew || editingId) && (
            <div className="p-4 bg-white rounded-2xl border-2 border-blue-200 shadow-sm space-y-3">
              <div className="font-extrabold text-xs text-blue-950 flex items-center justify-between">
                <span>{isAddingNew ? t('departments.newDept') : t('departments.editDept')}</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingNew(false);
                    setEditingId(null);
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600 font-bold"
                >
                  {t('common.cancel')}
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">{t('departments.nameLabel')}</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t('departments.namePlaceholder')}
                  className="w-full text-xs font-semibold p-2 border border-gray-300 rounded-xl focus:outline-none focus:border-blue-600 bg-white"
                  autoFocus
                />
              </div>

              {/* Seletor de Cores (10 Curadas + Personalizada) */}
              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1.5 flex items-center justify-between">
                  <span>{t('departments.colorLabel')}</span>
                  <span className="font-mono text-[10px] text-gray-400">{formColor}</span>
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setFormColor(c.hex)}
                      style={{ backgroundColor: c.hex }}
                      className={`w-7 h-7 rounded-full transition-transform cursor-pointer flex items-center justify-center text-white shadow-2xs ${
                        formColor.toLowerCase() === c.hex.toLowerCase()
                          ? 'ring-2 ring-offset-2 ring-gray-900 scale-110'
                          : 'hover:scale-105'
                      }`}
                      title={c.name}
                    >
                      {formColor.toLowerCase() === c.hex.toLowerCase() && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </button>
                  ))}
                  <div className="relative flex items-center">
                    <input
                      type="color"
                      value={formColor}
                      onChange={(e) => setFormColor(e.target.value)}
                      className="w-7 h-7 rounded-full cursor-pointer border border-gray-200"
                    />
                  </div>
                </div>
              </div>

              {/* Seletor de Ícones */}
              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1.5">{t('departments.iconLabel')}</label>
                <div className="grid grid-cols-7 gap-1.5">
                  {ICON_OPTIONS.map((item) => {
                    const Comp = item.icon;
                    const isSel = formIcon === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setFormIcon(item.id)}
                        className={`p-2 rounded-xl flex flex-col items-center justify-center transition cursor-pointer border ${
                          isSel
                            ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-2xs'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                        title={tr(item.label)}
                      >
                        <Comp className="w-4 h-4" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleSaveItem}
                  className="px-4 py-2 bg-[#16422B] hover:bg-[#2B6143] text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer whitespace-nowrap"
                >
                  {t('departments.saveDept')}
                </button>
              </div>
            </div>
          )}

          {/* Lista de Departamentos Atuais */}
          <div className="space-y-2">
            {deptList.map((dept) => {
              const matchedIcon = ICON_OPTIONS.find((i) => i.id === dept.icon);
              const IconComp = matchedIcon ? matchedIcon.icon : Layers;
              return (
                <div
                  key={dept.id}
                  className="p-3 bg-white rounded-2xl border border-[#E2E8E4] flex items-center justify-between hover:shadow-xs transition gap-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 shadow-2xs"
                      style={{ backgroundColor: dept.color || '#2563EB' }}
                    >
                      <IconComp className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-extrabold text-xs text-gray-900 truncate">{tr(dept.name)}</div>
                      <div className="text-[10px] font-mono text-gray-400">ID: {dept.id}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(dept)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition cursor-pointer"
                      title={t('common.edit')}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {departments.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleDelete(dept.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition cursor-pointer"
                        title={t('common.remove')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rodapé */}
        <div className="p-4 border-t border-[#E2E8E4] bg-white flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleStartAdd}
            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>{t('departments.addNewDept')}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#16422B] text-white text-xs font-bold rounded-xl hover:bg-[#2B6143] transition cursor-pointer shadow-xs whitespace-nowrap"
          >
            {t('common.done')}
          </button>
        </div>
      </div>
    </div>
  );
}
