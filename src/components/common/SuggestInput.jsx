// Drop-in replacement for a plain `<input>` that was wired to add native-browser
// autocomplete via <datalist>. Disabled 2026-05-18 — iOS Safari proved laggy
// while typing (datalist rebuild per keystroke jank). Kept as a pass-through so
// the existing call sites still compile and we can re-enable the feature later
// by restoring the datalist branch without touching every form.
//
// `suggestions` is accepted but ignored. All other props go straight to <input>.
// eslint-disable-next-line no-unused-vars
export default function SuggestInput({ suggestions, className = '', ...inputProps }) {
  return <input {...inputProps} className={className} />
}
