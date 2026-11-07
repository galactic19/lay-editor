import { common, createLowlight } from 'lowlight';

/**
 * Loaded lazily by codeHighlight. Importing this module (rather than `lowlight` itself)
 * keeps bundlers from pulling in lowlight's full `all` language set.
 */
export const createCommonLowlight = () => createLowlight(common);
