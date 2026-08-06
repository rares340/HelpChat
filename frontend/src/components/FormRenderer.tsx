import { useState } from 'react';
import type { ChatForm } from '@practica/shared';
import { api } from '../api/client';

/**
 * Randează un formular dinamic (ChatForm) ca HTML editabil în balonul de chat.
 * La submit trimite direct la /api/forms/:id (fără LLM) și afișează rezultatul.
 * Formularele sunt efemere: după succes se înlocuiesc cu confirmarea.
 */
export function FormRenderer({
  form,
  conversationId,
  onSubmitted,
}: {
  form: ChatForm;
  conversationId: number | null;
  onSubmitted?: () => void;
}) {
  const [values, setValues] = useState<Record<string, string | number | boolean>>(() => {
    const init: Record<string, string | number | boolean> = {};
    for (const field of form.fields) {
      if (field.value !== undefined) init[field.name] = field.value;
      else if (field.type === 'boolean') init[field.name] = false;
      else init[field.name] = '';
    }
    return init;
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const set = (name: string, v: string | number | boolean) => setValues((prev) => ({ ...prev, [name]: v }));

  async function submit() {
    if (submitting || result?.ok) return;
    setSubmitting(true);
    setResult(null);
    // Câmpurile goale (și checkbox-urile nebifate) se omit — exact ca dropEmptyArgs
    // din backend; zod-ul le tratează ca absente.
    const payload: Record<string, unknown> = {};
    for (const field of form.fields) {
      const v = values[field.name];
      if (field.type === 'boolean') {
        if (v === true) payload[field.name] = true;
      } else if (v !== undefined && v !== '') {
        payload[field.name] = v;
      }
    }
    try {
      const res = await api.submitForm(form.id, payload, conversationId);
      setResult({ ok: true, message: res.message });
      onSubmitted?.();
    } catch (err) {
      setResult({ ok: false, message: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.ok) {
    return (
      <div className="chat-form">
        <strong className="chat-form-title">{form.title}</strong>
        <div className="form-result ok">✓ {result.message}</div>
      </div>
    );
  }

  return (
    <div className="chat-form">
      <strong className="chat-form-title">{form.title}</strong>
      <div className="form-grid">
        {form.fields.map((field) => {
          const id = `${form.id}-${field.name}`;
          const value = values[field.name];
          return (
            <div key={field.name} className={`form-field${field.type === 'boolean' ? ' form-field-boolean' : ''}`}>
              {field.type === 'boolean' ? (
                <label className="checkbox-label" htmlFor={id}>
                  <input
                    id={id}
                    type="checkbox"
                    checked={value === true}
                    onChange={(e) => set(field.name, e.target.checked)}
                  />
                  {field.label}
                </label>
              ) : (
                <>
                  <label htmlFor={id}>
                    {field.label}
                    {field.required ? ' *' : ''}
                  </label>
                  {field.type === 'select' ? (
                    <select
                      id={id}
                      value={String(value ?? '')}
                      required={field.required}
                      onChange={(e) => set(field.name, e.target.value)}
                    >
                      <option value="">— alege —</option>
                      {field.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'textarea' ? (
                    <textarea
                      id={id}
                      rows={2}
                      value={String(value ?? '')}
                      placeholder={field.placeholder}
                      onChange={(e) => set(field.name, e.target.value)}
                    />
                  ) : (
                    <input
                      id={id}
                      type={field.type}
                      value={String(value ?? '')}
                      placeholder={field.placeholder}
                      required={field.required}
                      onChange={(e) => set(field.name, e.target.value)}
                    />
                  )}
                </>
              )}
              {field.description && <span className="form-hint">{field.description}</span>}
            </div>
          );
        })}
      </div>
      {result && !result.ok && <div className="form-result error">{result.message}</div>}
      <button className="btn primary" disabled={submitting} onClick={submit}>
        {submitting ? 'Se salvează…' : form.submitLabel}
      </button>
    </div>
  );
}
