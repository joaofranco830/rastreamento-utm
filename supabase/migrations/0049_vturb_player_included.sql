-- =============================================================================
-- 0049_vturb_player_included.sql — seleção de quais VSLs sincronizar.
--
-- Uma conta VTurb pode ter dezenas de vídeos, a maioria sem relevância. Só
-- sincronizamos as VSLs marcadas (included=true), o que também alivia o rate
-- limit da API. Default false: a lista é atualizada barato (1 GET /players/list)
-- e o usuário escolhe as poucas relevantes.
-- =============================================================================

alter table vturb_players add column if not exists included boolean not null default false;
