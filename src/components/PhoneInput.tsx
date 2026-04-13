import PhoneInputLib, { isValidPhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

const PhoneInput = ({ value, onChange, error }: PhoneInputProps) => {
  return (
    <div>
      <PhoneInputLib
        international
        defaultCountry="SN"
        value={value}
        onChange={(v) => onChange(v || "")}
        className="phone-input-custom"
      />
      {error && <p className="text-destructive text-xs mt-1">{error}</p>}
    </div>
  );
};

export { PhoneInput, isValidPhoneNumber };
