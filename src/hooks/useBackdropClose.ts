import { useRef, useCallback, useEffect, MouseEvent } from 'react';

/**
 * Hook to reliably handle backdrop click-to-close on modal dialogs.
 *
 * Prevents the notorious "drag-to-dismiss" bug:
 * When a user selects text, drags a scrollbar, or clicks inside an input/textarea 
 * within the modal, and the mouse pointer is released (mouseup) outside the modal 
 * window on the backdrop, the browser dispatches a `click` event to the common ancestor
 * (the backdrop container). A naive `e.target === e.currentTarget` check evaluates to true,
 * causing the modal to close unexpectedly and lose user input.
 *
 * This hook verifies that BOTH `mousedown` AND `click` (mouseup) originated directly 
 * on the backdrop element itself.
 */
export function useBackdropClose(
  onClose?: () => void,
  disabled: boolean = false,
  closeOnEscape: boolean = false
) {
  const isBackdropMouseDownRef = useRef(false);

  const onMouseDown = useCallback((e: MouseEvent) => {
    isBackdropMouseDownRef.current = e.target === e.currentTarget;
  }, []);

  const onClick = useCallback((e: MouseEvent) => {
    if (disabled || !onClose) return;
    if (isBackdropMouseDownRef.current && e.target === e.currentTarget) {
      onClose();
    }
    isBackdropMouseDownRef.current = false;
  }, [disabled, onClose]);

  useEffect(() => {
    if (!closeOnEscape || disabled || !onClose) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [closeOnEscape, disabled, onClose]);

  return { onMouseDown, onClick };
}
