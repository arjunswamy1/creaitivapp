UPDATE public.clients SET 
  logo_url = '/billy-logo.svg',
  brand_colors = jsonb_build_object(
    'background', '170 30% 93%',
    'foreground', '180 25% 15%',
    'primary', '163 65% 26%',
    'primaryForeground', '0 0% 100%',
    'accent', '163 65% 26%',
    'accentForeground', '0 0% 100%',
    'card', '170 25% 88%',
    'cardForeground', '180 25% 15%',
    'secondary', '170 20% 82%',
    'secondaryForeground', '180 25% 20%',
    'muted', '170 15% 85%',
    'mutedForeground', '180 10% 45%',
    'border', '170 15% 78%',
    'fontHeading', 'Nunito',
    'fontBody', 'Nunito',
    'fontImportUrl', 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&display=swap'
  )
WHERE slug = 'billy';
