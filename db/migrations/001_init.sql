-- Baseline schema + seed (SQUASHED)
--
-- This project is pre-launch; we intentionally squash the DB into a single
-- init file and reset databases (Render + local) instead of preserving
-- historical continuity.
--
-- This file must be executable as plain SQL via the Node pg client
-- (i.e. no psql meta-commands like \\restrict). It includes:
-- - schema
-- - minimal seed content for CMS pages used during dogfooding
--
-- PostgreSQL database dump
--


-- Dumped from database version 16.11 (Debian 16.11-1.pgdg13+1)
-- Dumped by pg_dump version 16.11 (Debian 16.11-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: touch_ceremony_winner_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_ceremony_winner_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: touch_season_invite_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_season_invite_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_log (
    id bigint NOT NULL,
    actor_user_id bigint NOT NULL,
    action text NOT NULL,
    target_type text,
    target_id bigint,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.admin_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admin_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.admin_audit_log_id_seq OWNED BY public.admin_audit_log.id;


--
-- Name: app_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_config (
    id boolean DEFAULT true NOT NULL,
    active_ceremony_id bigint
);


--
-- Name: app_user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_user (
    id bigint NOT NULL,
    username text NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_admin boolean DEFAULT false NOT NULL
);


--
-- Name: app_user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.app_user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: app_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.app_user_id_seq OWNED BY public.app_user.id;


--
-- Name: auth_password; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_password (
    user_id bigint NOT NULL,
    password_hash text NOT NULL,
    password_algo text NOT NULL,
    password_set_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: auth_password_reset; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_password_reset (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: auth_password_reset_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.auth_password_reset_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auth_password_reset_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.auth_password_reset_id_seq OWNED BY public.auth_password_reset.id;


--
-- Name: category_edition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.category_edition (
    id bigint NOT NULL,
    ceremony_id bigint NOT NULL,
    family_id bigint NOT NULL,
    unit_kind text NOT NULL,
    icon_id bigint,
    sort_index integer DEFAULT 0 NOT NULL,
    CONSTRAINT category_edition_unit_kind_check CHECK ((unit_kind = ANY (ARRAY['FILM'::text, 'SONG'::text, 'PERFORMANCE'::text])))
);


--
-- Name: category_edition_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.category_edition_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: category_edition_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.category_edition_id_seq OWNED BY public.category_edition.id;


--
-- Name: category_family; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.category_family (
    id bigint NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    icon_id bigint NOT NULL,
    default_unit_kind text NOT NULL,
    CONSTRAINT category_family_default_unit_kind_check CHECK ((default_unit_kind = ANY (ARRAY['FILM'::text, 'SONG'::text, 'PERFORMANCE'::text])))
);


--
-- Name: category_family_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.category_family_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: category_family_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.category_family_id_seq OWNED BY public.category_family.id;


--
-- Name: ceremony; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ceremony (
    id bigint NOT NULL,
    code text,
    name text,
    year integer,
    draft_locked_at timestamp with time zone,
    starts_at timestamp with time zone,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    draft_warning_hours integer DEFAULT 24 NOT NULL,
    published_at timestamp with time zone,
    archived_at timestamp with time zone,
    CONSTRAINT ceremony_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'PUBLISHED'::text, 'LOCKED'::text, 'ARCHIVED'::text])))
);


--
-- Name: ceremony_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ceremony_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ceremony_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ceremony_id_seq OWNED BY public.ceremony.id;


--
-- Name: ceremony_winner; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ceremony_winner (
    id bigint NOT NULL,
    ceremony_id bigint NOT NULL,
    category_edition_id bigint NOT NULL,
    nomination_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ceremony_winner_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ceremony_winner_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ceremony_winner_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ceremony_winner_id_seq OWNED BY public.ceremony_winner.id;


--
-- Name: cms_dynamic_content; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_dynamic_content (
    id bigint NOT NULL,
    key text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    body_markdown text DEFAULT ''::text NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone,
    created_by_user_id bigint,
    updated_by_user_id bigint,
    published_by_user_id bigint,
    variant text DEFAULT 'info'::text NOT NULL,
    dismissible boolean DEFAULT true NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    CONSTRAINT cms_dynamic_content_status_check CHECK ((status = ANY (ARRAY['DRAFT'::text, 'PUBLISHED'::text]))),
    CONSTRAINT cms_dynamic_content_variant_check CHECK ((variant = ANY (ARRAY['info'::text, 'warning'::text, 'success'::text, 'error'::text])))
);


--
-- Name: cms_dynamic_content_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cms_dynamic_content_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cms_dynamic_content_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cms_dynamic_content_id_seq OWNED BY public.cms_dynamic_content.id;


--
-- Name: cms_static_content; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_static_content (
    key text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    body_markdown text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by_user_id bigint
);


--
-- Name: draft; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.draft (
    id bigint NOT NULL,
    league_id bigint NOT NULL,
    status text NOT NULL,
    draft_order_type text NOT NULL,
    current_pick_number integer,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    version integer DEFAULT 0 NOT NULL,
    season_id bigint NOT NULL,
    picks_per_seat integer,
    remainder_strategy text DEFAULT 'UNDRAFTED'::text NOT NULL,
    total_picks integer,
    pick_timer_seconds integer,
    auto_pick_strategy text,
    pick_deadline_at timestamp with time zone,
    pick_timer_remaining_ms integer,
    auto_pick_seed text,
    auto_pick_config jsonb,
    allow_drafting_after_lock boolean DEFAULT false NOT NULL,
    lock_override_set_by_user_id integer,
    lock_override_set_at timestamp with time zone,
    CONSTRAINT draft_auto_pick_strategy_check CHECK (((auto_pick_strategy IS NULL) OR (auto_pick_strategy = ANY (ARRAY['NEXT_AVAILABLE'::text, 'RANDOM_SEED'::text, 'ALPHABETICAL'::text, 'CANONICAL'::text, 'SMART'::text, 'CUSTOM_USER'::text])))),
    CONSTRAINT draft_draft_order_type_check CHECK ((draft_order_type = ANY (ARRAY['SNAKE'::text, 'LINEAR'::text]))),
    CONSTRAINT draft_remainder_strategy_check CHECK ((remainder_strategy = ANY (ARRAY['UNDRAFTED'::text, 'FULL_POOL'::text]))),
    CONSTRAINT draft_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'IN_PROGRESS'::text, 'PAUSED'::text, 'COMPLETED'::text, 'CANCELLED'::text])))
);


--
-- Name: draft_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.draft_event (
    id bigint NOT NULL,
    draft_id bigint NOT NULL,
    version integer NOT NULL,
    event_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: draft_event_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.draft_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: draft_event_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.draft_event_id_seq OWNED BY public.draft_event.id;


--
-- Name: draft_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.draft_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: draft_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.draft_id_seq OWNED BY public.draft.id;


--
-- Name: draft_pick; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.draft_pick (
    id bigint NOT NULL,
    draft_id bigint NOT NULL,
    pick_number integer NOT NULL,
    round_number integer NOT NULL,
    seat_number integer NOT NULL,
    league_member_id bigint NOT NULL,
    nomination_id bigint NOT NULL,
    made_at timestamp with time zone,
    request_id text,
    user_id bigint NOT NULL
);


--
-- Name: draft_pick_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.draft_pick_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: draft_pick_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.draft_pick_id_seq OWNED BY public.draft_pick.id;


--
-- Name: draft_result; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.draft_result (
    id bigint NOT NULL,
    draft_id bigint NOT NULL,
    nomination_id bigint NOT NULL,
    won boolean NOT NULL,
    points integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: draft_result_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.draft_result_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: draft_result_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.draft_result_id_seq OWNED BY public.draft_result.id;


--
-- Name: draft_seat; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.draft_seat (
    id bigint NOT NULL,
    draft_id bigint NOT NULL,
    league_member_id bigint NOT NULL,
    seat_number integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: draft_seat_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.draft_seat_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: draft_seat_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.draft_seat_id_seq OWNED BY public.draft_seat.id;


--
-- Name: film; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.film (
    id bigint NOT NULL,
    title text NOT NULL,
    country text,
    tmdb_id integer,
    ref text,
    release_year integer,
    external_ids jsonb,
    poster_path text,
    poster_url text,
    tmdb_last_synced_at timestamp with time zone,
    tmdb_credits jsonb
);


--
-- Name: film_credit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.film_credit (
    id bigint NOT NULL,
    film_id bigint NOT NULL,
    person_id bigint NOT NULL,
    credit_type text NOT NULL,
    department text,
    job text,
    "character" text,
    cast_order integer,
    tmdb_credit_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT film_credit_type_check CHECK ((credit_type = ANY (ARRAY['CAST'::text, 'CREW'::text])))
);


--
-- Name: film_credit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.film_credit ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.film_credit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: film_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.film_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: film_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.film_id_seq OWNED BY public.film.id;


--
-- Name: icon; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.icon (
    id bigint NOT NULL,
    code text NOT NULL,
    name text,
    asset_path text
);


--
-- Name: icon_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.icon_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: icon_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.icon_id_seq OWNED BY public.icon.id;


--
-- Name: league; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.league (
    id bigint NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    ceremony_id bigint,
    max_members integer NOT NULL,
    roster_size integer NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    created_by_user_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_public_season boolean DEFAULT false NOT NULL
);


--
-- Name: league_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.league_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: league_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.league_id_seq OWNED BY public.league.id;


--
-- Name: league_member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.league_member (
    id bigint NOT NULL,
    league_id bigint NOT NULL,
    user_id bigint NOT NULL,
    role text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT league_member_role_check CHECK ((role = ANY (ARRAY['OWNER'::text, 'CO_OWNER'::text, 'MEMBER'::text])))
);


--
-- Name: league_member_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.league_member_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: league_member_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.league_member_id_seq OWNED BY public.league_member.id;


--
-- Name: migration_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migration_history (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: nomination; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nomination (
    id bigint NOT NULL,
    category_edition_id bigint NOT NULL,
    film_id bigint,
    song_id bigint,
    performance_id bigint,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    replaced_by_nomination_id bigint,
    CONSTRAINT chk_nomination_single_subject CHECK ((((((film_id IS NOT NULL))::integer + ((song_id IS NOT NULL))::integer) + ((performance_id IS NOT NULL))::integer) = 1)),
    CONSTRAINT nomination_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'REVOKED'::text, 'REPLACED'::text])))
);


--
-- Name: nomination_change_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nomination_change_audit (
    id bigint NOT NULL,
    nomination_id bigint NOT NULL,
    replacement_nomination_id bigint,
    origin text NOT NULL,
    impact text NOT NULL,
    action text NOT NULL,
    reason text NOT NULL,
    created_by_user_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT nomination_change_audit_action_check CHECK ((action = ANY (ARRAY['REVOKE'::text, 'REPLACE'::text, 'RESTORE'::text]))),
    CONSTRAINT nomination_change_audit_impact_check CHECK ((impact = ANY (ARRAY['CONSEQUENTIAL'::text, 'BENIGN'::text]))),
    CONSTRAINT nomination_change_audit_origin_check CHECK ((origin = ANY (ARRAY['INTERNAL'::text, 'EXTERNAL'::text])))
);


--
-- Name: nomination_change_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nomination_change_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nomination_change_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nomination_change_audit_id_seq OWNED BY public.nomination_change_audit.id;


--
-- Name: nomination_contributor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nomination_contributor (
    id bigint NOT NULL,
    nomination_id bigint NOT NULL,
    person_id bigint NOT NULL,
    role_label text,
    sort_order integer DEFAULT 0 NOT NULL
);


--
-- Name: nomination_contributor_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nomination_contributor_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nomination_contributor_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nomination_contributor_id_seq OWNED BY public.nomination_contributor.id;


--
-- Name: nomination_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.nomination_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nomination_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.nomination_id_seq OWNED BY public.nomination.id;


--
-- Name: performance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.performance (
    id bigint NOT NULL,
    film_id bigint NOT NULL,
    person_id bigint NOT NULL
);


--
-- Name: performance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.performance_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: performance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.performance_id_seq OWNED BY public.performance.id;


--
-- Name: person; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.person (
    id bigint NOT NULL,
    full_name text NOT NULL,
    tmdb_id integer,
    profile_path text,
    profile_url text,
    external_ids jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: person_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.person_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: person_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.person_id_seq OWNED BY public.person.id;


--
-- Name: season; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.season (
    id bigint NOT NULL,
    league_id bigint NOT NULL,
    ceremony_id bigint NOT NULL,
    status text DEFAULT 'EXTANT'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    scoring_strategy_name text DEFAULT 'fixed'::text NOT NULL,
    remainder_strategy text DEFAULT 'UNDRAFTED'::text NOT NULL,
    CONSTRAINT season_remainder_strategy_check CHECK ((remainder_strategy = ANY (ARRAY['UNDRAFTED'::text, 'FULL_POOL'::text]))),
    CONSTRAINT season_scoring_strategy_name_check CHECK ((scoring_strategy_name = ANY (ARRAY['fixed'::text, 'negative'::text]))),
    CONSTRAINT season_status_check CHECK ((status = ANY (ARRAY['EXTANT'::text, 'CANCELLED'::text])))
);


--
-- Name: season_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.season_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: season_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.season_id_seq OWNED BY public.season.id;


--
-- Name: season_invite; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.season_invite (
    id bigint NOT NULL,
    season_id bigint NOT NULL,
    intended_user_id bigint,
    token_hash character(64),
    kind text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    label text,
    created_by_user_id bigint NOT NULL,
    claimed_by_user_id bigint,
    claimed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_placeholder_token CHECK ((((kind = 'PLACEHOLDER'::text) AND (token_hash IS NOT NULL)) OR ((kind = 'USER_TARGETED'::text) AND (token_hash IS NULL)))),
    CONSTRAINT season_invite_kind_check CHECK ((kind = ANY (ARRAY['PLACEHOLDER'::text, 'USER_TARGETED'::text]))),
    CONSTRAINT season_invite_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'CLAIMED'::text, 'REVOKED'::text, 'DECLINED'::text])))
);


--
-- Name: season_invite_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.season_invite_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: season_invite_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.season_invite_id_seq OWNED BY public.season_invite.id;


--
-- Name: season_member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.season_member (
    id bigint NOT NULL,
    season_id bigint NOT NULL,
    user_id bigint NOT NULL,
    league_member_id bigint,
    role text DEFAULT 'MEMBER'::text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT season_member_role_check CHECK ((role = ANY (ARRAY['OWNER'::text, 'CO_OWNER'::text, 'MEMBER'::text])))
);


--
-- Name: season_member_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.season_member_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: season_member_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.season_member_id_seq OWNED BY public.season_member.id;


--
-- Name: song; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.song (
    id bigint NOT NULL,
    title text NOT NULL,
    film_id bigint NOT NULL
);


--
-- Name: song_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.song_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: song_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.song_id_seq OWNED BY public.song.id;


--
-- Name: admin_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_log ALTER COLUMN id SET DEFAULT nextval('public.admin_audit_log_id_seq'::regclass);


--
-- Name: app_user id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user ALTER COLUMN id SET DEFAULT nextval('public.app_user_id_seq'::regclass);


--
-- Name: auth_password_reset id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_password_reset ALTER COLUMN id SET DEFAULT nextval('public.auth_password_reset_id_seq'::regclass);


--
-- Name: category_edition id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_edition ALTER COLUMN id SET DEFAULT nextval('public.category_edition_id_seq'::regclass);


--
-- Name: category_family id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_family ALTER COLUMN id SET DEFAULT nextval('public.category_family_id_seq'::regclass);


--
-- Name: ceremony id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceremony ALTER COLUMN id SET DEFAULT nextval('public.ceremony_id_seq'::regclass);


--
-- Name: ceremony_winner id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceremony_winner ALTER COLUMN id SET DEFAULT nextval('public.ceremony_winner_id_seq'::regclass);


--
-- Name: cms_dynamic_content id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_dynamic_content ALTER COLUMN id SET DEFAULT nextval('public.cms_dynamic_content_id_seq'::regclass);


--
-- Name: draft id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft ALTER COLUMN id SET DEFAULT nextval('public.draft_id_seq'::regclass);


--
-- Name: draft_event id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_event ALTER COLUMN id SET DEFAULT nextval('public.draft_event_id_seq'::regclass);


--
-- Name: draft_pick id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_pick ALTER COLUMN id SET DEFAULT nextval('public.draft_pick_id_seq'::regclass);


--
-- Name: draft_result id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_result ALTER COLUMN id SET DEFAULT nextval('public.draft_result_id_seq'::regclass);


--
-- Name: draft_seat id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_seat ALTER COLUMN id SET DEFAULT nextval('public.draft_seat_id_seq'::regclass);


--
-- Name: film id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.film ALTER COLUMN id SET DEFAULT nextval('public.film_id_seq'::regclass);


--
-- Name: icon id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.icon ALTER COLUMN id SET DEFAULT nextval('public.icon_id_seq'::regclass);


--
-- Name: league id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.league ALTER COLUMN id SET DEFAULT nextval('public.league_id_seq'::regclass);


--
-- Name: league_member id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.league_member ALTER COLUMN id SET DEFAULT nextval('public.league_member_id_seq'::regclass);


--
-- Name: nomination id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomination ALTER COLUMN id SET DEFAULT nextval('public.nomination_id_seq'::regclass);


--
-- Name: nomination_change_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomination_change_audit ALTER COLUMN id SET DEFAULT nextval('public.nomination_change_audit_id_seq'::regclass);


--
-- Name: nomination_contributor id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomination_contributor ALTER COLUMN id SET DEFAULT nextval('public.nomination_contributor_id_seq'::regclass);


--
-- Name: performance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance ALTER COLUMN id SET DEFAULT nextval('public.performance_id_seq'::regclass);


--
-- Name: person id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.person ALTER COLUMN id SET DEFAULT nextval('public.person_id_seq'::regclass);


--
-- Name: season id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.season ALTER COLUMN id SET DEFAULT nextval('public.season_id_seq'::regclass);


--
-- Name: season_invite id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.season_invite ALTER COLUMN id SET DEFAULT nextval('public.season_invite_id_seq'::regclass);


--
-- Name: season_member id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.season_member ALTER COLUMN id SET DEFAULT nextval('public.season_member_id_seq'::regclass);


--
-- Name: song id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.song ALTER COLUMN id SET DEFAULT nextval('public.song_id_seq'::regclass);


--
-- Name: admin_audit_log admin_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id);


--
-- Name: app_config app_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_config
    ADD CONSTRAINT app_config_pkey PRIMARY KEY (id);


--
-- Name: app_user app_user_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_email_key UNIQUE (email);


--
-- Name: app_user app_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_pkey PRIMARY KEY (id);


--
-- Name: app_user app_user_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_username_key UNIQUE (username);


--
-- Name: auth_password auth_password_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_password
    ADD CONSTRAINT auth_password_pkey PRIMARY KEY (user_id);


--
-- Name: auth_password_reset auth_password_reset_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_password_reset
    ADD CONSTRAINT auth_password_reset_pkey PRIMARY KEY (id);


--
-- Name: auth_password_reset auth_password_reset_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_password_reset
    ADD CONSTRAINT auth_password_reset_token_hash_key UNIQUE (token_hash);


--
-- Name: category_edition category_edition_ceremony_id_family_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_edition
    ADD CONSTRAINT category_edition_ceremony_id_family_id_key UNIQUE (ceremony_id, family_id);


--
-- Name: category_edition category_edition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_edition
    ADD CONSTRAINT category_edition_pkey PRIMARY KEY (id);


--
-- Name: category_family category_family_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_family
    ADD CONSTRAINT category_family_code_key UNIQUE (code);


--
-- Name: category_family category_family_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_family
    ADD CONSTRAINT category_family_pkey PRIMARY KEY (id);


--
-- Name: ceremony ceremony_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceremony
    ADD CONSTRAINT ceremony_code_key UNIQUE (code);


--
-- Name: ceremony ceremony_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceremony
    ADD CONSTRAINT ceremony_pkey PRIMARY KEY (id);


--
-- Name: ceremony_winner ceremony_winner_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceremony_winner
    ADD CONSTRAINT ceremony_winner_pkey PRIMARY KEY (id);


--
-- Name: cms_dynamic_content cms_dynamic_content_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_dynamic_content
    ADD CONSTRAINT cms_dynamic_content_pkey PRIMARY KEY (id);


--
-- Name: cms_static_content cms_static_content_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_static_content
    ADD CONSTRAINT cms_static_content_pkey PRIMARY KEY (key);


--
-- Name: draft_event draft_event_draft_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_event
    ADD CONSTRAINT draft_event_draft_id_version_key UNIQUE (draft_id, version);


--
-- Name: draft_event draft_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_event
    ADD CONSTRAINT draft_event_pkey PRIMARY KEY (id);


--
-- Name: draft_pick draft_pick_draft_id_nomination_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_pick
    ADD CONSTRAINT draft_pick_draft_id_nomination_id_key UNIQUE (draft_id, nomination_id);


--
-- Name: draft_pick draft_pick_draft_id_pick_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_pick
    ADD CONSTRAINT draft_pick_draft_id_pick_number_key UNIQUE (draft_id, pick_number);


--
-- Name: draft_pick draft_pick_draft_id_round_number_seat_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_pick
    ADD CONSTRAINT draft_pick_draft_id_round_number_seat_number_key UNIQUE (draft_id, round_number, seat_number);


--
-- Name: draft_pick draft_pick_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_pick
    ADD CONSTRAINT draft_pick_pkey PRIMARY KEY (id);


--
-- Name: draft draft_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft
    ADD CONSTRAINT draft_pkey PRIMARY KEY (id);


--
-- Name: draft_result draft_result_draft_id_nomination_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_result
    ADD CONSTRAINT draft_result_draft_id_nomination_id_key UNIQUE (draft_id, nomination_id);


--
-- Name: draft_result draft_result_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_result
    ADD CONSTRAINT draft_result_pkey PRIMARY KEY (id);


--
-- Name: draft_seat draft_seat_draft_id_league_member_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_seat
    ADD CONSTRAINT draft_seat_draft_id_league_member_id_key UNIQUE (draft_id, league_member_id);


--
-- Name: draft_seat draft_seat_draft_id_seat_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_seat
    ADD CONSTRAINT draft_seat_draft_id_seat_number_key UNIQUE (draft_id, seat_number);


--
-- Name: draft_seat draft_seat_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_seat
    ADD CONSTRAINT draft_seat_pkey PRIMARY KEY (id);


--
-- Name: film_credit film_credit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.film_credit
    ADD CONSTRAINT film_credit_pkey PRIMARY KEY (id);


--
-- Name: film film_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.film
    ADD CONSTRAINT film_pkey PRIMARY KEY (id);


--
-- Name: icon icon_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.icon
    ADD CONSTRAINT icon_code_key UNIQUE (code);


--
-- Name: icon icon_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.icon
    ADD CONSTRAINT icon_pkey PRIMARY KEY (id);


--
-- Name: league league_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.league
    ADD CONSTRAINT league_code_key UNIQUE (code);


--
-- Name: league_member league_member_league_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.league_member
    ADD CONSTRAINT league_member_league_id_user_id_key UNIQUE (league_id, user_id);


--
-- Name: league_member league_member_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.league_member
    ADD CONSTRAINT league_member_pkey PRIMARY KEY (id);


--
-- Name: league league_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.league
    ADD CONSTRAINT league_pkey PRIMARY KEY (id);


--
-- Name: migration_history migration_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_history
    ADD CONSTRAINT migration_history_pkey PRIMARY KEY (filename);


--
-- Name: nomination_change_audit nomination_change_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomination_change_audit
    ADD CONSTRAINT nomination_change_audit_pkey PRIMARY KEY (id);


--
-- Name: nomination_contributor nomination_contributor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomination_contributor
    ADD CONSTRAINT nomination_contributor_pkey PRIMARY KEY (id);


--
-- Name: nomination nomination_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomination
    ADD CONSTRAINT nomination_pkey PRIMARY KEY (id);


--
-- Name: performance performance_film_id_person_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance
    ADD CONSTRAINT performance_film_id_person_id_key UNIQUE (film_id, person_id);


--
-- Name: performance performance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance
    ADD CONSTRAINT performance_pkey PRIMARY KEY (id);


--
-- Name: person person_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.person
    ADD CONSTRAINT person_pkey PRIMARY KEY (id);


--
-- Name: season_invite season_invite_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.season_invite
    ADD CONSTRAINT season_invite_pkey PRIMARY KEY (id);


--
-- Name: season_member season_member_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.season_member
    ADD CONSTRAINT season_member_pkey PRIMARY KEY (id);


--
-- Name: season_member season_member_season_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.season_member
    ADD CONSTRAINT season_member_season_id_user_id_key UNIQUE (season_id, user_id);


--
-- Name: season season_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.season
    ADD CONSTRAINT season_pkey PRIMARY KEY (id);


--
-- Name: song song_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.song
    ADD CONSTRAINT song_pkey PRIMARY KEY (id);


--
-- Name: season_invite uq_season_invite_token; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.season_invite
    ADD CONSTRAINT uq_season_invite_token UNIQUE (token_hash) DEFERRABLE;


--
-- Name: app_user_email_lower_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_user_email_lower_key ON public.app_user USING btree (lower(email));


--
-- Name: app_user_username_lower_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX app_user_username_lower_key ON public.app_user USING btree (lower(username));


--
-- Name: cms_dynamic_content_key_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cms_dynamic_content_key_created_at_idx ON public.cms_dynamic_content USING btree (key, created_at DESC);


--
-- Name: cms_dynamic_content_key_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cms_dynamic_content_key_status_idx ON public.cms_dynamic_content USING btree (key, status);


--
-- Name: cms_dynamic_content_one_published_per_key_except_banner; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cms_dynamic_content_one_published_per_key_except_banner ON public.cms_dynamic_content USING btree (key) WHERE ((status = 'PUBLISHED'::text) AND (key <> 'banner'::text));


--
-- Name: film_credit_film_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX film_credit_film_id_idx ON public.film_credit USING btree (film_id);


--
-- Name: film_credit_person_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX film_credit_person_id_idx ON public.film_credit USING btree (person_id);


--
-- Name: film_credit_unique_tmdb; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX film_credit_unique_tmdb ON public.film_credit USING btree (film_id, tmdb_credit_id) WHERE (tmdb_credit_id IS NOT NULL);


--
-- Name: film_ref_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX film_ref_key ON public.film USING btree (ref);


--
-- Name: film_tmdb_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX film_tmdb_id_key ON public.film USING btree (tmdb_id);


--
-- Name: idx_admin_audit_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_audit_log_created_at ON public.admin_audit_log USING btree (created_at DESC);


--
-- Name: idx_auth_password_reset_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_password_reset_user ON public.auth_password_reset USING btree (user_id);


--
-- Name: idx_ceremony_starts_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ceremony_starts_at ON public.ceremony USING btree (starts_at);


--
-- Name: idx_ceremony_winner_ceremony; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ceremony_winner_ceremony ON public.ceremony_winner USING btree (ceremony_id);


--
-- Name: idx_draft_allow_drafting_after_lock; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_draft_allow_drafting_after_lock ON public.draft USING btree (allow_drafting_after_lock);


--
-- Name: idx_draft_event_draft; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_draft_event_draft ON public.draft_event USING btree (draft_id);


--
-- Name: idx_draft_event_draft_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_draft_event_draft_version ON public.draft_event USING btree (draft_id, version);


--
-- Name: idx_draft_pick_draft; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_draft_pick_draft ON public.draft_pick USING btree (draft_id);


--
-- Name: idx_draft_pick_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_draft_pick_member ON public.draft_pick USING btree (league_member_id);


--
-- Name: idx_draft_pick_nomination; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_draft_pick_nomination ON public.draft_pick USING btree (nomination_id);


--
-- Name: idx_draft_pick_request_per_draft; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_draft_pick_request_per_draft ON public.draft_pick USING btree (draft_id, request_id) WHERE (request_id IS NOT NULL);


--
-- Name: idx_draft_pick_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_draft_pick_user ON public.draft_pick USING btree (user_id);


--
-- Name: idx_draft_remainder_strategy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_draft_remainder_strategy ON public.draft USING btree (remainder_strategy);


--
-- Name: idx_draft_result_draft; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_draft_result_draft ON public.draft_result USING btree (draft_id);


--
-- Name: idx_draft_result_nomination; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_draft_result_nomination ON public.draft_result USING btree (nomination_id);


--
-- Name: idx_draft_seat_draft; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_draft_seat_draft ON public.draft_seat USING btree (draft_id);


--
-- Name: idx_league_member_league; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_league_member_league ON public.league_member USING btree (league_id);


--
-- Name: idx_league_member_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_league_member_user ON public.league_member USING btree (user_id);


--
-- Name: idx_nomination_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nomination_category ON public.nomination USING btree (category_edition_id);


--
-- Name: idx_nomination_change_nomination; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nomination_change_nomination ON public.nomination_change_audit USING btree (nomination_id);


--
-- Name: idx_nomination_contributor_nomination; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nomination_contributor_nomination ON public.nomination_contributor USING btree (nomination_id);


--
-- Name: idx_nomination_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nomination_status ON public.nomination USING btree (status);


--
-- Name: idx_season_invite_season; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_season_invite_season ON public.season_invite USING btree (season_id);


--
-- Name: idx_season_invite_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_season_invite_status ON public.season_invite USING btree (status);


--
-- Name: idx_season_invite_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_season_invite_token_hash ON public.season_invite USING btree (token_hash);


--
-- Name: idx_season_league; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_season_league ON public.season USING btree (league_id);


--
-- Name: idx_season_member_season; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_season_member_season ON public.season_member USING btree (season_id);


--
-- Name: idx_season_member_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_season_member_user ON public.season_member USING btree (user_id);


--
-- Name: person_tmdb_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX person_tmdb_id_key ON public.person USING btree (tmdb_id);


--
-- Name: uniq_ceremony_winner_category_nomination; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_ceremony_winner_category_nomination ON public.ceremony_winner USING btree (category_edition_id, nomination_id);


--
-- Name: uniq_draft_season; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_draft_season ON public.draft USING btree (season_id);


--
-- Name: uniq_public_season_per_ceremony; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_public_season_per_ceremony ON public.league USING btree (ceremony_id) WHERE (is_public_season = true);


--
-- Name: uniq_season_extant_league_ceremony; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_season_extant_league_ceremony ON public.season USING btree (league_id, ceremony_id) WHERE (status = 'EXTANT'::text);


--
-- Name: uq_pending_user_invite_per_season; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_pending_user_invite_per_season ON public.season_invite USING btree (season_id, intended_user_id) WHERE ((status = 'PENDING'::text) AND (intended_user_id IS NOT NULL) AND (kind = 'USER_TARGETED'::text));


--
-- Name: ceremony_winner trg_touch_ceremony_winner_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch_ceremony_winner_updated_at BEFORE UPDATE ON public.ceremony_winner FOR EACH ROW EXECUTE FUNCTION public.touch_ceremony_winner_updated_at();


--
-- Name: season_invite trg_touch_season_invite_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_touch_season_invite_updated_at BEFORE UPDATE ON public.season_invite FOR EACH ROW EXECUTE FUNCTION public.touch_season_invite_updated_at();


--
-- Name: admin_audit_log admin_audit_log_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.app_user(id);


--
-- Name: app_config app_config_active_ceremony_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_config
    ADD CONSTRAINT app_config_active_ceremony_id_fkey FOREIGN KEY (active_ceremony_id) REFERENCES public.ceremony(id);


--
-- Name: auth_password_reset auth_password_reset_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_password_reset
    ADD CONSTRAINT auth_password_reset_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;


--
-- Name: auth_password auth_password_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_password
    ADD CONSTRAINT auth_password_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;


--
-- Name: category_edition category_edition_ceremony_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_edition
    ADD CONSTRAINT category_edition_ceremony_id_fkey FOREIGN KEY (ceremony_id) REFERENCES public.ceremony(id);


--
-- Name: category_edition category_edition_family_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_edition
    ADD CONSTRAINT category_edition_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.category_family(id);


--
-- Name: category_edition category_edition_icon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_edition
    ADD CONSTRAINT category_edition_icon_id_fkey FOREIGN KEY (icon_id) REFERENCES public.icon(id);


--
-- Name: category_family category_family_icon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_family
    ADD CONSTRAINT category_family_icon_id_fkey FOREIGN KEY (icon_id) REFERENCES public.icon(id);


--
-- Name: ceremony_winner ceremony_winner_category_edition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceremony_winner
    ADD CONSTRAINT ceremony_winner_category_edition_id_fkey FOREIGN KEY (category_edition_id) REFERENCES public.category_edition(id) ON DELETE CASCADE;


--
-- Name: ceremony_winner ceremony_winner_ceremony_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceremony_winner
    ADD CONSTRAINT ceremony_winner_ceremony_id_fkey FOREIGN KEY (ceremony_id) REFERENCES public.ceremony(id) ON DELETE CASCADE;


--
-- Name: ceremony_winner ceremony_winner_nomination_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ceremony_winner
    ADD CONSTRAINT ceremony_winner_nomination_id_fkey FOREIGN KEY (nomination_id) REFERENCES public.nomination(id) ON DELETE CASCADE;


--
-- Name: cms_dynamic_content cms_dynamic_content_created_by_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_dynamic_content
    ADD CONSTRAINT cms_dynamic_content_created_by_fk FOREIGN KEY (created_by_user_id) REFERENCES public.app_user(id);


--
-- Name: cms_dynamic_content cms_dynamic_content_published_by_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_dynamic_content
    ADD CONSTRAINT cms_dynamic_content_published_by_fk FOREIGN KEY (published_by_user_id) REFERENCES public.app_user(id);


--
-- Name: cms_dynamic_content cms_dynamic_content_updated_by_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_dynamic_content
    ADD CONSTRAINT cms_dynamic_content_updated_by_fk FOREIGN KEY (updated_by_user_id) REFERENCES public.app_user(id);


--
-- Name: cms_static_content cms_static_content_updated_by_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_static_content
    ADD CONSTRAINT cms_static_content_updated_by_fk FOREIGN KEY (updated_by_user_id) REFERENCES public.app_user(id);


--
-- Name: draft_event draft_event_draft_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_event
    ADD CONSTRAINT draft_event_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES public.draft(id) ON DELETE CASCADE;


--
-- Name: draft draft_league_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft
    ADD CONSTRAINT draft_league_id_fkey FOREIGN KEY (league_id) REFERENCES public.league(id) ON DELETE CASCADE;


--
-- Name: draft_pick draft_pick_draft_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_pick
    ADD CONSTRAINT draft_pick_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES public.draft(id) ON DELETE CASCADE;


--
-- Name: draft_pick draft_pick_league_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_pick
    ADD CONSTRAINT draft_pick_league_member_id_fkey FOREIGN KEY (league_member_id) REFERENCES public.league_member(id);


--
-- Name: draft_pick draft_pick_nomination_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_pick
    ADD CONSTRAINT draft_pick_nomination_id_fkey FOREIGN KEY (nomination_id) REFERENCES public.nomination(id);


--
-- Name: draft_pick draft_pick_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_pick
    ADD CONSTRAINT draft_pick_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id);


--
-- Name: draft_result draft_result_draft_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_result
    ADD CONSTRAINT draft_result_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES public.draft(id) ON DELETE CASCADE;


--
-- Name: draft_result draft_result_nomination_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_result
    ADD CONSTRAINT draft_result_nomination_id_fkey FOREIGN KEY (nomination_id) REFERENCES public.nomination(id);


--
-- Name: draft draft_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft
    ADD CONSTRAINT draft_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.season(id) ON DELETE CASCADE;


--
-- Name: draft_seat draft_seat_draft_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_seat
    ADD CONSTRAINT draft_seat_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES public.draft(id) ON DELETE CASCADE;


--
-- Name: draft_seat draft_seat_league_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.draft_seat
    ADD CONSTRAINT draft_seat_league_member_id_fkey FOREIGN KEY (league_member_id) REFERENCES public.league_member(id);


--
-- Name: film_credit film_credit_film_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.film_credit
    ADD CONSTRAINT film_credit_film_id_fkey FOREIGN KEY (film_id) REFERENCES public.film(id) ON DELETE CASCADE;


--
-- Name: film_credit film_credit_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.film_credit
    ADD CONSTRAINT film_credit_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.person(id) ON DELETE CASCADE;


--
-- Name: league league_ceremony_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.league
    ADD CONSTRAINT league_ceremony_id_fkey FOREIGN KEY (ceremony_id) REFERENCES public.ceremony(id);


--
-- Name: league league_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.league
    ADD CONSTRAINT league_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.app_user(id);


--
-- Name: league_member league_member_league_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.league_member
    ADD CONSTRAINT league_member_league_id_fkey FOREIGN KEY (league_id) REFERENCES public.league(id) ON DELETE CASCADE;


--
-- Name: league_member league_member_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.league_member
    ADD CONSTRAINT league_member_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id);


--
-- Name: nomination nomination_category_edition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomination
    ADD CONSTRAINT nomination_category_edition_id_fkey FOREIGN KEY (category_edition_id) REFERENCES public.category_edition(id);


--
-- Name: nomination_change_audit nomination_change_audit_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomination_change_audit
    ADD CONSTRAINT nomination_change_audit_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.app_user(id);


--
-- Name: nomination_change_audit nomination_change_audit_nomination_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomination_change_audit
    ADD CONSTRAINT nomination_change_audit_nomination_id_fkey FOREIGN KEY (nomination_id) REFERENCES public.nomination(id);


--
-- Name: nomination_change_audit nomination_change_audit_replacement_nomination_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomination_change_audit
    ADD CONSTRAINT nomination_change_audit_replacement_nomination_id_fkey FOREIGN KEY (replacement_nomination_id) REFERENCES public.nomination(id);


--
-- Name: nomination_contributor nomination_contributor_nomination_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomination_contributor
    ADD CONSTRAINT nomination_contributor_nomination_id_fkey FOREIGN KEY (nomination_id) REFERENCES public.nomination(id);


--
-- Name: nomination_contributor nomination_contributor_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomination_contributor
    ADD CONSTRAINT nomination_contributor_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.person(id);


--
-- Name: nomination nomination_film_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomination
    ADD CONSTRAINT nomination_film_id_fkey FOREIGN KEY (film_id) REFERENCES public.film(id);


--
-- Name: nomination nomination_performance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomination
    ADD CONSTRAINT nomination_performance_id_fkey FOREIGN KEY (performance_id) REFERENCES public.performance(id);


--
-- Name: nomination nomination_replaced_by_nomination_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomination
    ADD CONSTRAINT nomination_replaced_by_nomination_id_fkey FOREIGN KEY (replaced_by_nomination_id) REFERENCES public.nomination(id);


--
-- Name: nomination nomination_song_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nomination
    ADD CONSTRAINT nomination_song_id_fkey FOREIGN KEY (song_id) REFERENCES public.song(id);


--
-- Name: performance performance_film_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance
    ADD CONSTRAINT performance_film_id_fkey FOREIGN KEY (film_id) REFERENCES public.film(id);


--
-- Name: performance performance_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance
    ADD CONSTRAINT performance_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.person(id);


--
-- Name: season season_ceremony_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.season
    ADD CONSTRAINT season_ceremony_id_fkey FOREIGN KEY (ceremony_id) REFERENCES public.ceremony(id);


--
-- Name: season_invite season_invite_claimed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.season_invite
    ADD CONSTRAINT season_invite_claimed_by_user_id_fkey FOREIGN KEY (claimed_by_user_id) REFERENCES public.app_user(id);


--
-- Name: season_invite season_invite_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.season_invite
    ADD CONSTRAINT season_invite_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.app_user(id);


--
-- Name: season_invite season_invite_intended_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.season_invite
    ADD CONSTRAINT season_invite_intended_user_id_fkey FOREIGN KEY (intended_user_id) REFERENCES public.app_user(id) ON DELETE SET NULL;


--
-- Name: season_invite season_invite_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.season_invite
    ADD CONSTRAINT season_invite_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.season(id) ON DELETE CASCADE;


--
-- Name: season season_league_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.season
    ADD CONSTRAINT season_league_id_fkey FOREIGN KEY (league_id) REFERENCES public.league(id) ON DELETE CASCADE;


--
-- Name: season_member season_member_league_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.season_member
    ADD CONSTRAINT season_member_league_member_id_fkey FOREIGN KEY (league_member_id) REFERENCES public.league_member(id) ON DELETE SET NULL;


--
-- Name: season_member season_member_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.season_member
    ADD CONSTRAINT season_member_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.season(id) ON DELETE CASCADE;


--
-- Name: season_member season_member_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.season_member
    ADD CONSTRAINT season_member_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;


--
-- Name: song song_film_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.song
    ADD CONSTRAINT song_film_id_fkey FOREIGN KEY (film_id) REFERENCES public.film(id);


--
-- PostgreSQL database dump complete
--



--
-- Seed data (dogfooding defaults)
--
--
-- PostgreSQL database dump
--


-- Dumped from database version 16.11 (Debian 16.11-1.pgdg13+1)
-- Dumped by pg_dump version 16.11 (Debian 16.11-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: cms_dynamic_content; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.cms_dynamic_content (id, key, title, body_markdown, status, created_at, updated_at, published_at, created_by_user_id, updated_by_user_id, published_by_user_id, variant, dismissible, starts_at, ends_at) VALUES (1, 'home_main', 'Dogfooding Notes: What We''re Testing This Week', 'This is the current announcement space.

- Focus areas right now: registration/login flows, league + season creation, and draft room stability under refresh/reconnect.
- If something feels confusing, write down what you expected to happen and what actually happened, then include the URL and timestamp.', 'PUBLISHED', '2026-01-31 13:01:11.276774+00', '2026-01-31 13:01:11.276774+00', '2026-01-31 13:01:11.276774+00', NULL, NULL, NULL, 'info', true, NULL, NULL);


--
-- Data for Name: cms_static_content; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.cms_static_content (key, title, body_markdown, updated_at, updated_by_user_id) VALUES ('about', 'About', 'Fantasy Oscars is a lightweight draft game for awards season.

Create a league, invite friends, draft nominees, and follow standings as winners are set.', '2026-01-31 13:01:11.276774+00', NULL);
INSERT INTO public.cms_static_content (key, title, body_markdown, updated_at, updated_by_user_id) VALUES ('faq', 'FAQ', '## What is this?

Fantasy Oscars is a fan-made game where you draft Oscar nominees and score points as winners are announced.

## Do I need an account?

Yes. Accounts are used to join leagues and participate in drafts.', '2026-01-31 13:01:11.276774+00', NULL);
INSERT INTO public.cms_static_content (key, title, body_markdown, updated_at, updated_by_user_id) VALUES ('landing_blurb', 'Fantasy Oscars', 'Draft night, but for awards.

Create a league, draft nominees, and watch standings update as winners are announced.', '2026-01-31 13:01:11.276774+00', NULL);
INSERT INTO public.cms_static_content (key, title, body_markdown, updated_at, updated_by_user_id) VALUES ('legal_terms', 'Terms', 'MVP terms: use at your own risk during dogfooding; features and data may change.', '2026-01-31 13:01:11.276774+00', NULL);
INSERT INTO public.cms_static_content (key, title, body_markdown, updated_at, updated_by_user_id) VALUES ('legal_privacy', 'Privacy', 'MVP policy: we store account and league data to run the game. We do not sell personal information.', '2026-01-31 13:01:11.276774+00', NULL);
INSERT INTO public.cms_static_content (key, title, body_markdown, updated_at, updated_by_user_id) VALUES ('code_of_conduct', 'Code of Conduct', '## Purpose

This Code of Conduct exists to help maintain a respectful, welcoming environment for everyone using the app. It sets expectations for behavior and outlines how concerns are handled.

## Expected Behavior

We expect users to interact with others in a respectful and considerate manner. This includes engaging in good faith, respecting differing opinions, and contributing constructively to shared spaces within the app.

## Prohibited Behavior

Prohibited behavior includes, but is not limited to:

- Harassment, abuse, or intimidation
- Hate speech or discriminatory language
- Impersonation of others
- Posting unlawful or malicious content
- Disrupting the normal operation of the app

## Reporting Concerns

If you encounter behavior or content that you believe violates this Code of Conduct, you may report it to us. Reports should include enough detail to allow us to understand and review the concern.

## Enforcement

We reserve the right to take appropriate action in response to violations of this Code of Conduct, including content removal, account suspension, or account termination. Enforcement decisions are made at our discretion and may be taken without prior notice.', '2026-01-31 13:01:11.284537+00', NULL);


--
-- Name: cms_dynamic_content_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cms_dynamic_content_id_seq', 1, true);


--
-- PostgreSQL database dump complete
--
