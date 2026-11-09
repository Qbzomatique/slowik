-- Uruchomić DOPIERO razem z wdrożeniem nowej gry: wynik powstaje już tylko z play_guess.
-- Wcześniej obecna wersja strony straciłaby możliwość zapisu wyników.

revoke execute on function public.submit_result(integer, text[], boolean, boolean) from authenticated;
