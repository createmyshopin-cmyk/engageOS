import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { play } from "../services/api";
import { usePlayStore } from "../store/playStore";
import { normalizePhone, normalizeSource, validateName } from "../utils";

interface RegisterFormProps {
  merchant: string;
  campaign: string;
}

export function RegisterForm({ merchant, campaign }: RegisterFormProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const setResult = usePlayStore((s) => s.setResult);
  const setCustomerName = usePlayStore((s) => s.setCustomerName);

  const mutation = useMutation({
    mutationFn: play,
    onSuccess: (res) => {
      if (res.ok && res.result) {
        setCustomerName(name.trim());
        setResult(res.result);
      } else if (res.fields) {
        setErrors(res.fields);
      } else {
        setErrors({ phone: res.error ?? "Something went wrong. Please try again." });
      }
    },
    onError: () => {
      setErrors({ phone: "Network error — please check your connection and retry." });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nameError = validateName(name);
    const normalizedPhone = normalizePhone(phone);
    const next: typeof errors = {};
    if (nameError) next.name = nameError;
    if (!normalizedPhone) next.phone = "Enter a valid 10-digit mobile number";
    setErrors(next);
    if (nameError || !normalizedPhone) return;

    mutation.mutate({
      merchantSlug: merchant,
      campaignSlug: campaign,
      name: name.trim().replace(/\s+/g, " "),
      phone: normalizedPhone,
      source: normalizeSource(new URLSearchParams(window.location.search).get("src")),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="fade-up flex w-full flex-col gap-4" noValidate>
      <div>
        <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
          Your name
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          enterKeyHint="next"
          maxLength={60}
          className="field w-full rounded-xl border border-white/10 bg-card px-4 py-3.5 text-base outline-none"
          placeholder="Full name"
        />
        {errors.name && <p className="mt-1 text-sm text-red-400">{errors.name}</p>}
      </div>
      <div>
        <label htmlFor="phone" className="mb-1.5 block text-sm font-medium">
          WhatsApp number
        </label>
        <input
          id="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          enterKeyHint="go"
          maxLength={13}
          className="field w-full rounded-xl border border-white/10 bg-card px-4 py-3.5 text-base outline-none"
          placeholder="10-digit mobile number"
        />
        {errors.phone && <p className="mt-1 text-sm text-red-400">{errors.phone}</p>}
      </div>
      <button
        type="submit"
        disabled={mutation.isPending}
        className="press mt-2 rounded-full bg-brand px-6 py-4 text-base font-bold text-black disabled:opacity-60"
      >
        {mutation.isPending ? "Getting your card…" : "Scratch & Win"}
      </button>
    </form>
  );
}
