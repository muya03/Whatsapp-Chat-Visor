import { Icon } from '../Icon';

interface Props {
  size: number;
  group?: boolean;
  src?: string | null;
  label?: string;
}

/** Avatar por defecto de WhatsApp (silueta sobre gris) o imagen local elegida por el usuario. */
export function Avatar({ size, group, src, label }: Props) {
  return (
    <span className="avatar" style={{ width: size, height: size }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {src ? <img src={src} alt="" draggable={false} /> : <Icon name={group ? 'group' : 'person'} size={Math.round(size * 0.62)} />}
    </span>
  );
}
