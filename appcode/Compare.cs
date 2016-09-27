using System;

class Comparison
{
    static void Main(string[] args)
    {
        long val1 = 0xffffff;
        ulong val2 = 0xffffff00;

        if ((long)val2 > val1)
        {
            Console.WriteLine("It's greater than val1");
        }

	if ((ulong)val1 < val2) 
	{
	    Console.WriteLine("It's greater than val1");
	}
    }
}