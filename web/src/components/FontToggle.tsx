import { useSpecialFonts } from "../fonts";

// The "Aa" of logo_type_on.svg / logo_typo_off.svg, drawn inline so it takes the button colour.
const LETTERS =
  "M15.8944 22.3984H14.1024L13.2864 20.0784H8.56644L7.75044 22.3984H5.99044L9.95844 11.2784H11.9264L15.8944 22.3984ZM12.7904 18.6864L10.9344 13.3744L9.06244 18.6864H12.7904ZM23.1207 21.1184C22.854 21.5131 22.438 21.8544 21.8727 22.1424C21.3074 22.4198 20.6994 22.5584 20.0487 22.5584C19.4727 22.5584 18.9554 22.4464 18.4967 22.2224C18.0487 21.9878 17.6914 21.6678 17.4247 21.2624C17.1687 20.8571 17.0407 20.4091 17.0407 19.9184C17.0407 19.1078 17.334 18.4358 17.9207 17.9024C18.5074 17.3584 19.3874 17.0864 20.5607 17.0864H23.1207C23.0994 16.4464 22.902 15.9291 22.5287 15.5344C22.166 15.1291 21.67 14.9264 21.0407 14.9264C20.4754 14.9264 20.006 15.0811 19.6327 15.3904C19.27 15.6998 19.0354 16.1371 18.9287 16.7024H17.2807C17.4087 15.7318 17.814 14.9478 18.4967 14.3504C19.1794 13.7424 20.0594 13.4384 21.1367 13.4384C21.8194 13.4384 22.4434 13.5931 23.0087 13.9024C23.574 14.2011 24.022 14.6384 24.3527 15.2144C24.6834 15.7904 24.8487 16.4678 24.8487 17.2464V22.3984H23.1207V21.1184ZM20.3527 21.0224C20.7794 21.0224 21.206 20.9318 21.6327 20.7504C22.0594 20.5691 22.4114 20.2971 22.6887 19.9344C22.9767 19.5611 23.1207 19.1078 23.1207 18.5744H20.5127C19.926 18.5744 19.4887 18.6918 19.2007 18.9264C18.9234 19.1504 18.7847 19.4438 18.7847 19.8064C18.7847 20.1691 18.9234 20.4624 19.2007 20.6864C19.478 20.9104 19.862 21.0224 20.3527 21.0224Z";

// Turns the special fonts of the messages on or off, for those who want to read them plainly.
function FontToggle() {
  const { special, toggleSpecial } = useSpecialFonts();
  const label = special ? "Désactiver les polices spéciales" : "Activer les polices spéciales";
  return (
    <button
      type="button"
      className="font-toggle"
      aria-label={label}
      aria-pressed={!special}
      data-tip={label}
      onClick={toggleSpecial}
    >
      <svg className="camera-icon font-icon" viewBox="2.9 2.9 26 26" aria-hidden="true">
        <rect x="3.4" y="3.4" width="25" height="25" rx="1" />
        <path className="font-letters" d={LETTERS} />
        {!special && <path d="M6.4 26.4 L25.4 5.4" />}
      </svg>
    </button>
  );
}

export default FontToggle;
