import { Globe, Check } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, loadLocale } from "@/i18n";
import i18n from "@/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function LanguageSwitcher() {
  const { t } = useTranslation("settings");
  const [currentLang, setCurrentLang] = useState(i18n.language);

  function isSelected(code: string): boolean {
    if (currentLang === code) {
      return true;
    }
    const base = code.split("-")[0];
    return currentLang.startsWith(base) && !SUPPORTED_LANGUAGES.some((l) => l.code === currentLang);
  }

  async function handleChange(code: string) {
    await loadLocale(code);
    await i18n.changeLanguage(code);
    setCurrentLang(code);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="p-1 rounded-md text-neutral-500 hover:text-neutral-200 hover:bg-[var(--glass-subtle-hover)] transition-all duration-200 cursor-pointer"
          title={t("language")}
        >
          <Globe className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>{t("language")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SUPPORTED_LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleChange(lang.code)}
            className="flex items-center justify-between"
          >
            <div>
              <span className="text-sm text-neutral-200">{lang.nativeName}</span>
              <span className="text-[11px] text-neutral-500 ml-2">{lang.name}</span>
            </div>
            {isSelected(lang.code) && <Check className="w-3.5 h-3.5 text-orange-500 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
