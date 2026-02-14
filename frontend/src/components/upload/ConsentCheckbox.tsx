"use client";

interface ConsentCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function ConsentCheckbox({ checked, onChange }: ConsentCheckboxProps) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-warm-300 text-warm-700 focus:ring-warm-500"
      />
      <span className="text-sm text-warm-600 group-hover:text-warm-700 leading-relaxed">
        I consent to uploading these photos for face recognition processing.
        Photos will be used solely for matching guests to their event photos.
        EXIF data will be stripped from all processed images.
      </span>
    </label>
  );
}
