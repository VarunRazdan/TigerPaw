import { ArrowLeftRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { OrderEntryForm } from "./OrderEntryForm";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";

type OrderEntrySheetProps = {
  extensionId: string;
  defaultSymbol?: string;
  priceEstimate?: number;
};

export function OrderEntrySheet({
  extensionId,
  defaultSymbol,
  priceEstimate,
}: OrderEntrySheetProps) {
  const { t } = useTranslation("trading");
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating trigger button — fixed at bottom-right, always visible */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-5 py-3 rounded-full bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold shadow-lg shadow-black/40 hover:shadow-xl hover:shadow-black/50 transition-all duration-300 cursor-pointer hover:-translate-y-0.5"
      >
        <ArrowLeftRight className="w-4 h-4" />
        {t("placeOrder")}
      </button>

      {/* Slide-over panel */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="sm:max-w-[420px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("placeOrder")}</SheetTitle>
            <SheetDescription className="sr-only">
              {t("placeOrder")} — {extensionId}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <OrderEntryForm
              extensionId={extensionId}
              defaultSymbol={defaultSymbol}
              priceEstimate={priceEstimate}
              className="border-0 bg-transparent shadow-none p-0 backdrop-blur-none"
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
