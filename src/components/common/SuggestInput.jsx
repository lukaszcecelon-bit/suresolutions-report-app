import { useId } from 'react'

// Drop-in replacement for a plain `<input>` that adds native-browser autocomplete
// via <datalist>. Native datalist works the same as a stock browser dropdown,
// renders consistently on mobile (Android shows it on focus, iOS as a chip bar),
// and doesn't fight with the existing keyboard/touch behavior of regular inputs.
//
// Pass `suggestions={[...]}` with deduplicated string options. Empty array is a
// no-op (the input behaves like a plain input). Other props are forwarded.
export default function SuggestInput({ suggestions = [], className = '', ...inputProps }) {
  const id = useId()
  const hasSuggestions = suggestions && suggestions.length > 0

  return (
    <>
      <input
        {...inputProps}
        list={hasSuggestions ? id : undefined}
        autoComplete={hasSuggestions ? 'off' : inputProps.autoComplete}
        className={className}
      />
      {hasSuggestions && (
        <datalist id={id}>
          {suggestions.map((s, i) => <option key={i} value={s} />)}
        </datalist>
      )}
    </>
  )
}
